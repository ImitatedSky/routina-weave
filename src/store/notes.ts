import { create } from 'zustand'
import type { Note } from '@/notes/types'
import { renameLinks } from '@/notes/links'
import { fromTemplate } from '@/notes/templates'
import * as db from '@/storage/db'
import { seedNotes } from '@/notes/seed'
import { cardThumbnails } from '@/notes/cardlink'
import { coverAttachment } from '@/notes/covers'
import { bodyImageAttachments } from '@/notes/images'

/**
 * 所有筆記都在記憶體裡（個人筆記量級，幾千則也只有幾 MB），
 * 每次變動同步寫回 IndexedDB。
 */
interface NotesState {
  loaded: boolean
  notes: Record<string, Note>
  init: () => Promise<void>
  /** 新增筆記。沒給 templateId 時會套用上層頁面的「子頁面預設範本」 */
  createNote: (init?: Partial<Note> & { templateId?: string | null }) => Note
  updateNote: (id: string, patch: Partial<Note>) => void
  /** 連同所有子頁面一起刪除，回傳刪掉的 id */
  deleteNote: (id: string) => string[]
  /** 搬到別的上層頁面。不能搬到自己底下 */
  moveNote: (id: string, parent: string | null) => boolean
  /** 匯入：同 id 覆蓋、其他新增 */
  importNotes: (notes: Note[]) => void
}

let initPromise: Promise<void> | null = null

export const useNotes = create<NotesState>((set, get) => ({
  loaded: false,
  notes: {},

  init() {
    // StrictMode 會呼叫兩次；共用同一個 promise，示範筆記才不會建兩份
    initPromise ??= (async () => {
      let list = await db.loadNotes()
      if (list.length === 0 && !(await db.getMeta<boolean>('seeded'))) {
        list = seedNotes()
        await db.saveNotes(list)
        await db.setMeta('seeded', true)
      }
      set({ loaded: true, notes: Object.fromEntries(list.map((n) => [n.id, n])) })
    })()
    return initPromise
  },

  createNote(init = {}) {
    const { templateId, ...fields } = init
    const notes = get().notes
    const parent = fields.parent ?? null
    const now = new Date().toISOString()
    const title = fields.title ?? '未命名'

    const templateKey = templateId === undefined ? (parent ? notes[parent]?.childTemplate : undefined) : templateId
    const template = templateKey ? notes[templateKey] : undefined
    const fromTpl = template ? fromTemplate(template, title) : {}

    const note: Note = {
      id: crypto.randomUUID(),
      title,
      body: '',
      order: nextOrder(notes, parent),
      tags: [],
      props: {},
      created: now,
      updated: now,
      ...fromTpl,
      ...fields,
      parent,
    }
    set({ notes: { ...notes, [note.id]: note } })
    void db.saveNote(note)
    return note
  },

  updateNote(id, patch) {
    const notes = get().notes
    const current = notes[id]
    if (!current) return
    const updated: Note = { ...current, ...patch, id, updated: new Date().toISOString() }
    const next = { ...notes, [id]: updated }
    const changed = [updated]

    // 改標題：把其他筆記裡的 [[舊標題]] 一起改掉
    if (patch.title !== undefined && patch.title !== current.title && !current.template) {
      for (const other of Object.values(notes)) {
        if (other.id === id) continue
        const body = renameLinks(other.body, current.title, patch.title)
        if (body !== other.body) {
          next[other.id] = { ...other, body }
          changed.push(next[other.id])
        }
      }
    }
    set({ notes: next })
    void db.saveNotes(changed)
  },

  deleteNote(id) {
    const notes = get().notes
    const ids = [id, ...descendants(notes, id)]
    const next = { ...notes }
    const attachments = ids.flatMap((n) => (next[n] ? attachmentsOf(next[n]) : []))
    for (const n of ids) delete next[n]
    set({ notes: next })
    void db.deleteNotes(ids)
    releaseAttachments(next, attachments)
    return ids
  },

  moveNote(id, parent) {
    const notes = get().notes
    if (parent === id || (parent && descendants(notes, id).includes(parent))) return false
    get().updateNote(id, { parent, order: nextOrder(notes, parent) })
    return true
  },

  importNotes(list) {
    set({ notes: { ...get().notes, ...Object.fromEntries(list.map((n) => [n.id, n])) } })
    void db.saveNotes(list)
  },
}))

/** 這則筆記用到的附件：網址縮圖、封面圖片、內文連結卡片的縮圖、內文上傳的圖片 */
export function attachmentsOf(note: Note): string[] {
  const ids = [...cardThumbnails(note.body), ...bodyImageAttachments(note.body)]
  if (note.image) ids.push(note.image)
  const cover = coverAttachment(note.cover)
  if (cover) ids.push(cover)
  return ids
}

/**
 * 刪掉已經沒有筆記在用的附件。同一張圖可能被好幾則共用
 * （例如範本的封面會帶到用範本建立的頁面），所以刪之前要先確認。
 */
export function releaseAttachments(notes: Record<string, Note>, ids: string[]) {
  if (!ids.length) return
  const inUse = new Set(Object.values(notes).flatMap(attachmentsOf))
  for (const id of new Set(ids)) if (!inUse.has(id)) void db.deleteAttachment(id)
}

function nextOrder(notes: Record<string, Note>, parent: string | null): number {
  let max = -1
  for (const n of childrenOf(notes, parent)) if (n.order > max) max = n.order
  return max + 1
}

/**
 * 「上層 → 子頁面」對照表。每次有筆記變動 notes 都是新物件，所以用它當快取的鍵：
 * 同一個 notes 只建一次，側邊欄每個節點、子頁面清單都查這張表，不用各自掃全部筆記
 * （5000 則時側邊欄原本每次存檔要花 0.7 秒）。
 */
const childIndexCache = new WeakMap<Record<string, Note>, Map<string | null, Note[]>>()
const NO_CHILDREN: readonly Note[] = []

function childIndex(notes: Record<string, Note>): Map<string | null, Note[]> {
  let index = childIndexCache.get(notes)
  if (!index) {
    index = new Map()
    for (const n of Object.values(notes)) {
      const list = index.get(n.parent)
      if (list) list.push(n)
      else index.set(n.parent, [n])
    }
    for (const list of index.values()) list.sort((a, b) => a.order - b.order || a.created.localeCompare(b.created))
    childIndexCache.set(notes, index)
  }
  return index
}

/** 某一頁底下的子頁面，依 order 排好。回傳的是共用的陣列，不要直接改它 */
export function childrenOf(notes: Record<string, Note>, parent: string | null): readonly Note[] {
  return childIndex(notes).get(parent) ?? NO_CHILDREN
}

export function descendants(notes: Record<string, Note>, id: string): string[] {
  const out: string[] = []
  const stack = [id]
  const seen = new Set(stack)
  while (stack.length) {
    for (const n of childrenOf(notes, stack.pop()!)) {
      // 壞資料（上層互相指）也不會無限迴圈
      if (seen.has(n.id)) continue
      seen.add(n.id)
      out.push(n.id)
      stack.push(n.id)
    }
  }
  return out
}

/** 從最上層到這一頁的路徑（麵包屑） */
export function pathOf(notes: Record<string, Note>, id: string): Note[] {
  const path: Note[] = []
  let current: Note | undefined = notes[id]
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parent ? notes[current.parent] : undefined
  }
  return path
}
