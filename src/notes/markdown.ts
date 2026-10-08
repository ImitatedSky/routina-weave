import { parse, stringify } from 'yaml'
import type { Note, PropValue } from './types'

/**
 * Note ↔ .md 檔。格式：
 *
 * ```
 * ---
 * id: ...
 * title: ...
 * parent: ...
 * ---
 * 內文
 * ```
 *
 * 匯出 zip 與之後的 Drive 同步都走這裡，所以這是對外的檔案格式，改欄位要向下相容。
 */

const KNOWN_KEYS = [
  'id', 'title', 'parent', 'order', 'icon', 'cover', 'coverY', 'tags', 'url', 'site', 'description',
  'image', 'props', 'template', 'childTemplate', 'view', 'pinned', 'created', 'updated',
] as const

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function toMarkdown(note: Note): string {
  const meta: Record<string, unknown> = {
    id: note.id,
    title: note.title,
    parent: note.parent,
    order: note.order,
    icon: note.icon,
    cover: note.cover,
    coverY: note.coverY,
    tags: note.tags.length ? note.tags : undefined,
    url: note.url,
    site: note.site,
    description: note.description,
    image: note.image,
    props: Object.keys(note.props).length ? note.props : undefined,
    template: note.template || undefined,
    childTemplate: note.childTemplate,
    view: note.view,
    pinned: note.pinned || undefined,
    created: note.created,
    updated: note.updated,
    ...note.extra,
  }
  for (const key of Object.keys(meta)) {
    if (meta[key] === undefined) delete meta[key]
  }
  return `---\n${stringify(meta).trimEnd()}\n---\n\n${note.body}`
}

/** 解析失敗或缺 id 時回傳 null，由呼叫端決定要不要當成新筆記 */
export function fromMarkdown(text: string, fallbackTitle = '未命名'): Note | null {
  const match = FRONTMATTER.exec(text)
  let meta: Record<string, unknown> = {}
  if (match) {
    try {
      const parsed = parse(match[1])
      if (parsed && typeof parsed === 'object') meta = parsed as Record<string, unknown>
    } catch {
      return null
    }
  }
  const body = (match ? text.slice(match[0].length) : text).replace(/^\r?\n/, '')
  const now = new Date().toISOString()

  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(key)) extra[key] = value
  }

  return {
    id: str(meta.id) ?? crypto.randomUUID(),
    title: str(meta.title) ?? fallbackTitle,
    body,
    parent: str(meta.parent) ?? null,
    order: typeof meta.order === 'number' ? meta.order : 0,
    icon: str(meta.icon),
    cover: str(meta.cover),
    coverY: typeof meta.coverY === 'number' ? Math.min(100, Math.max(0, meta.coverY)) : undefined,
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    url: str(meta.url),
    site: str(meta.site),
    description: str(meta.description),
    image: str(meta.image),
    props: readProps(meta.props),
    template: meta.template === true || undefined,
    childTemplate: str(meta.childTemplate),
    view: meta.view === 'table' || meta.view === 'gallery' || meta.view === 'list' ? meta.view : undefined,
    pinned: meta.pinned === true || undefined,
    created: str(meta.created) ?? now,
    updated: str(meta.updated) ?? now,
    extra: Object.keys(extra).length ? extra : undefined,
  }
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  return String(value)
}

function readProps(value: unknown): Record<string, PropValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, PropValue> = {}
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[key] = v
    else if (v !== null && v !== undefined) out[key] = String(v)
  }
  return out
}

/** 內文裡的 #標籤。排除程式碼區塊與網址片段（# 前面要是行首或空白） */
export function inlineTags(body: string): string[] {
  const withoutCode = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  const tags = new Set<string>()
  for (const m of withoutCode.matchAll(/(?:^|\s)#([\p{L}\p{N}_\-/]+)/gu)) {
    if (!/^\d+$/.test(m[1])) tags.add(m[1])
  }
  return [...tags]
}

// 筆記物件不會被就地修改（updateNote 一律換新物件），所以可以用物件本身當快取的鍵：
// 沒改過的筆記不用每次存檔都重跑正規式
const tagCache = new WeakMap<Note, string[]>()

/** frontmatter 的 tags 加上內文的 #標籤 */
export function allTags(note: Note): string[] {
  let tags = tagCache.get(note)
  if (!tags) {
    tags = [...new Set([...note.tags, ...inlineTags(note.body)])]
    tagCache.set(note, tags)
  }
  return tags
}
