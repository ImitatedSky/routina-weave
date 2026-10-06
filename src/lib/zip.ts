import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { parse } from 'yaml'
import { fromMarkdown, toMarkdown } from '@/notes/markdown'
import type { Note } from '@/notes/types'
import type { Attachment } from '@/storage/db'

/**
 * 整包匯出／匯入。zip 的結構和 Notion 匯出一樣，子頁面放在與上層同名的資料夾裡：
 *
 * ```
 * 書單.md
 * 書單/原子習慣.md
 * _templates/讀書筆記.md
 * _attachments/<附件 id>.jpg
 * ```
 *
 * 每個 .md 的格式見 notes/markdown.ts。匯入時 frontmatter 有 id 的照 id 與 parent；
 * 沒有 id 的（Obsidian、Notion 匯出的）給新 id，標題用檔名，上層由資料夾推出來。
 */

export const TEMPLATES_DIR = '_templates'
export const ATTACHMENTS_DIR = '_attachments'

const MAX_NAME_LENGTH = 100
// 防 zip bomb：解壓前先看目錄裡宣告的大小與檔案數
const MAX_TOTAL_BYTES = 200 * 1024 * 1024
const MAX_FILES = 5000

const FORBIDDEN_CHARS = '\\/:*?"<>|'
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
}

// ---- 檔名 ----

/** 各作業系統都能用的檔名（不含副檔名） */
export function safeFilename(name: string): string {
  const chars = Array.from(name.trim()).filter((ch) => {
    const code = ch.codePointAt(0)!
    return code >= 0x20 && code !== 0x7f && !FORBIDDEN_CHARS.includes(ch)
  })
  // Windows 不允許結尾是點或空白
  let clean = chars.slice(0, MAX_NAME_LENGTH).join('').trim().replace(/[. ]+$/, '')
  if (!clean) return '未命名'
  if (WINDOWS_RESERVED.test(clean)) clean += '_'
  return clean
}

/** Notion 匯出的檔名後面會接 32 碼的 hash，例如「書單 0123…cdef」 */
export function titleFromFilename(name: string): string {
  return name.replace(/\s+[0-9a-f]{32}$/i, '') || name
}

export function exportFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `weave-export-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.zip`
}

// ---- 匯出 ----

function byOrder(a: Note, b: Note) {
  return a.order - b.order || a.created.localeCompare(b.created)
}

/**
 * 每則筆記在 zip 裡的路徑（不含 .md）。子頁面放在與上層同名的資料夾裡，
 * 最上層的範本放在 _templates/。同一資料夾裡同名的依序加「 (2)」「 (3)」。
 */
export function exportPaths(notes: Note[]): Map<string, string> {
  const ids = new Set(notes.map((n) => n.id))
  const children = new Map<string | null, Note[]>()
  for (const note of notes) {
    // 上層不在這批裡的當成最上層，才不會漏掉
    const parent = note.parent && ids.has(note.parent) ? note.parent : null
    const list = children.get(parent) ?? []
    list.push(note)
    children.set(parent, list)
  }
  for (const list of children.values()) list.sort(byOrder)

  const paths = new Map<string, string>()
  // 資料夾 → 已用掉的名稱（小寫比對，Windows 與 macOS 不分大小寫）
  const used = new Map<string, Set<string>>([['', new Set([TEMPLATES_DIR, ATTACHMENTS_DIR])]])

  const place = (note: Note, dir: string) => {
    if (paths.has(note.id)) return
    const names = used.get(dir) ?? new Set<string>()
    used.set(dir, names)
    const base = safeFilename(note.title)
    let name = base
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${base} (${i})`
    names.add(name.toLowerCase())
    const path = dir ? `${dir}/${name}` : name
    paths.set(note.id, path)
    for (const child of children.get(note.id) ?? []) place(child, path)
  }
  const rootDir = (note: Note) => (note.template ? TEMPLATES_DIR : '')

  for (const note of children.get(null) ?? []) place(note, rootDir(note))
  // 上層互相指來指去（壞資料）的筆記從最上層走不到，也放到最上層
  for (const note of [...notes].sort(byOrder)) place(note, rootDir(note))
  return paths
}

export async function buildExportZip(notes: Note[], attachments: Attachment[]): Promise<Uint8Array> {
  const files: Zippable = {}
  const paths = exportPaths(notes)
  for (const note of notes) {
    files[`${paths.get(note.id)}.md`] = strToU8(toMarkdown(note))
  }
  for (const attachment of attachments) {
    const ext = EXTENSIONS[attachment.type] ?? 'bin'
    const bytes = new Uint8Array(await attachment.blob.arrayBuffer())
    // 圖片本來就壓縮過，再壓一次只是浪費時間
    files[`${ATTACHMENTS_DIR}/${safeFilename(attachment.id)}.${ext}`] = [bytes, { level: 0 }]
  }
  return zipSync(files)
}

// ---- 匯入：讀檔 ----

export interface ImportSource {
  name: string
  bytes: Uint8Array
}

export interface ImportFile {
  /** zip 裡的路徑，例如「書單/原子習慣.md」 */
  path: string
  text: string
}

export interface ImportBundle {
  files: ImportFile[]
  attachments: Attachment[]
}

/** 切成段落並擋掉 ..、絕對路徑與隱藏檔（.obsidian/、macOS 的 __MACOSX/ 與 ._ 檔） */
function pathSegments(name: string): string[] | null {
  const segments = name.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.')
  if (segments.length === 0) return null
  if (segments.some((s) => s === '..' || s.startsWith('.') || s === '__MACOSX')) return null
  return segments
}

function isMarkdown(segments: string[]) {
  return /\.md$/i.test(segments[segments.length - 1])
}

function isAttachment(segments: string[]) {
  return segments.length >= 2 && segments[segments.length - 2] === ATTACHMENTS_DIR
}

function unzipEntries(data: Uint8Array): { segments: string[]; bytes: Uint8Array }[] {
  let count = 0
  let total = 0
  let tooLarge = false
  const raw = unzipSync(data, {
    filter(file) {
      if (file.name.endsWith('/')) return false
      const segments = pathSegments(file.name)
      if (!segments || !(isMarkdown(segments) || isAttachment(segments))) return false
      count++
      total += file.originalSize
      if (count > MAX_FILES || total > MAX_TOTAL_BYTES) {
        tooLarge = true
        return false
      }
      return true
    },
  })
  if (tooLarge) throw new Error(`zip 太大：最多 ${MAX_FILES} 個檔案、解壓後 ${MAX_TOTAL_BYTES / 1024 / 1024} MB`)

  const entries = Object.entries(raw).map(([name, bytes]) => ({ segments: pathSegments(name)!, bytes }))
  return stripCommonRoot(entries)
}

/**
 * 整包都包在同一個資料夾裡（Obsidian vault 直接壓縮、Notion 的「Export-…」）時把它拿掉，
 * 不然會多出一個只是外包裝的頁面。
 */
export function stripCommonRoot<T extends { segments: string[] }>(entries: T[]): T[] {
  if (entries.length === 0) return entries
  const first = entries[0].segments[0]
  if (first === ATTACHMENTS_DIR || first === TEMPLATES_DIR) return entries
  if (!entries.every((e) => e.segments.length >= 2 && e.segments[0] === first)) return entries
  return entries.map((e) => ({ ...e, segments: e.segments.slice(1) }))
}

/** 選到的檔案（.zip 或 .md）→ 要匯入的 .md 與附件 */
export function readImportSources(sources: ImportSource[]): ImportBundle {
  const files: ImportFile[] = []
  const attachments: Attachment[] = []
  const decoder = new TextDecoder()

  for (const source of sources) {
    if (/\.md$/i.test(source.name)) {
      files.push({ path: source.name, text: decoder.decode(source.bytes) })
      continue
    }
    if (!/\.zip$/i.test(source.name)) continue
    for (const { segments, bytes } of unzipEntries(source.bytes)) {
      const name = segments[segments.length - 1]
      if (isMarkdown(segments)) {
        files.push({ path: segments.join('/'), text: decoder.decode(bytes) })
      } else if (segments.length === 2 && segments[0] === ATTACHMENTS_DIR) {
        const dot = name.lastIndexOf('.')
        const id = dot > 0 ? name.slice(0, dot) : name
        const type = MIME_TYPES[name.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream'
        attachments.push({ id, type, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type }) })
      }
    }
  }
  return { files, attachments }
}

// ---- 匯入：.md → 筆記 ----

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** fromMarkdown 缺 id 時會自己產生一個，所以要另外看原文有沒有寫 */
function hasFrontmatterId(text: string): boolean {
  const match = FRONTMATTER.exec(text)
  if (!match) return false
  try {
    const meta = parse(match[1]) as Record<string, unknown> | null
    return !!meta && typeof meta === 'object' && meta.id !== null && meta.id !== undefined && meta.id !== ''
  } catch {
    return false
  }
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash)
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function isTemplatePath(path: string) {
  return path === TEMPLATES_DIR || path.startsWith(`${TEMPLATES_DIR}/`)
}

/**
 * 解析每個 .md。沒有 id 的檔案依資料夾推出上層：「X/」資料夾的上層是同一層的「X.md」，
 * 沒有對應的 .md 就建一個空頁面當資料夾頁。_templates/ 底下的是範本。
 */
export function notesFromFiles(files: ImportFile[]): { notes: Note[]; failed: string[] } {
  const notes: Note[] = []
  const failed: string[] = []
  const byPath = new Map<string, Note>()
  const orphans: { note: Note; dir: string }[] = []
  const nextOrder = new Map<string, number>()
  const orderIn = (dir: string) => {
    const order = nextOrder.get(dir) ?? 0
    nextOrder.set(dir, order + 1)
    return order
  }

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  for (const file of sorted) {
    const path = file.path.replace(/\.md$/i, '')
    const note = fromMarkdown(file.text, titleFromFilename(nameOf(path)))
    if (!note) {
      failed.push(file.path)
      continue
    }
    if (!hasFrontmatterId(file.text)) {
      const dir = dirOf(path)
      note.order = orderIn(dir)
      if (isTemplatePath(dir)) note.template = true
      orphans.push({ note, dir })
    }
    byPath.set(path, note)
    notes.push(note)
  }

  const now = new Date().toISOString()
  const folderPage = (dir: string): string | null => {
    if (!dir || dir === TEMPLATES_DIR) return null
    const found = byPath.get(dir)
    if (found) return found.id
    const parentDir = dirOf(dir)
    const page: Note = {
      id: crypto.randomUUID(),
      title: titleFromFilename(nameOf(dir)),
      body: '',
      parent: folderPage(parentDir),
      order: orderIn(parentDir),
      tags: [],
      props: {},
      template: isTemplatePath(parentDir) || undefined,
      created: now,
      updated: now,
    }
    byPath.set(dir, page)
    notes.push(page)
    return page.id
  }
  for (const { note, dir } of orphans) note.parent = folderPage(dir)

  return { notes, failed }
}

// ---- 匯入：和現有筆記比對 ----

export interface ImportPlan {
  /** 要寫入的筆記（新增與更新） */
  notes: Note[]
  added: number
  updated: number
  /** 已經有同 id 且不比較舊的 */
  skipped: number
}

function time(iso: string): number {
  return Date.parse(iso) || 0
}

/** 同 id 以 updated 較新的為準，同一包裡重複的 id 也一樣 */
export function planImport(incoming: Note[], existing: Record<string, Note>): ImportPlan {
  const newest = new Map<string, Note>()
  for (const note of incoming) {
    const previous = newest.get(note.id)
    if (!previous || time(note.updated) > time(previous.updated)) newest.set(note.id, note)
  }

  const notes: Note[] = []
  let added = 0
  let updated = 0
  let skipped = incoming.length - newest.size
  for (const note of newest.values()) {
    const current = existing[note.id]
    if (!current) {
      added++
      notes.push(note)
    } else if (time(note.updated) > time(current.updated)) {
      updated++
      notes.push(note)
    } else {
      skipped++
    }
  }

  // 上層不在這包也不在現有筆記裡的放到最上層，不然會變成哪裡都看不到的孤兒
  const known = (id: string) => newest.has(id) || id in existing
  return {
    notes: notes.map((n) => (n.parent && !known(n.parent) ? { ...n, parent: null } : n)),
    added,
    updated,
    skipped,
  }
}

export interface PreparedImport {
  plan: ImportPlan
  attachments: Attachment[]
  /** 無法解析的 .md 路徑 */
  failed: string[]
}

export function prepareImport(sources: ImportSource[], existing: Record<string, Note>): PreparedImport {
  const bundle = readImportSources(sources)
  const { notes, failed } = notesFromFiles(bundle.files)
  return { plan: planImport(notes, existing), attachments: bundle.attachments, failed }
}
