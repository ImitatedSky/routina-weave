import { create } from 'zustand'
import type { Note } from '@/notes/types'
import { renameLinks } from '@/notes/links'
import { fromTemplate } from '@/notes/templates'
import * as db from '@/storage/db'
import { seedNotes } from '@/notes/seed'

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

export const useNotes = create<NotesState>((set, get) => ({
  loaded: false,
  notes: {},

  async init() {
    if (get().loaded) return
    let list = await db.loadNotes()
    if (list.length === 0 && !(await db.getMeta<boolean>('seeded'))) {
      list = seedNotes()
      await db.saveNotes(list)
      await db.setMeta('seeded', true)
    }
    set({ loaded: true, notes: Object.fromEntries(list.map((n) => [n.id, n])) })
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
    const images: string[] = []
    for (const n of ids) {
      if (next[n]?.image) images.push(next[n].image!)
      delete next[n]
    }
    set({ notes: next })
    void db.deleteNotes(ids)
    for (const image of images) void db.deleteAttachment(image)
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

function nextOrder(notes: Record<string, Note>, parent: string | null): number {
  let max = -1
  for (const n of Object.values(notes)) {
    if (n.parent === parent && n.order > max) max = n.order
  }
  return max + 1
}

/** 某一頁底下的子頁面，依 order 排好 */
export function childrenOf(notes: Record<string, Note>, parent: string | null): Note[] {
  return Object.values(notes)
    .filter((n) => n.parent === parent)
    .sort((a, b) => a.order - b.order || a.created.localeCompare(b.created))
}

export function descendants(notes: Record<string, Note>, id: string): string[] {
  const out: string[] = []
  const stack = [id]
  while (stack.length) {
    const current = stack.pop()!
    for (const n of Object.values(notes)) {
      if (n.parent === current) {
        out.push(n.id)
        stack.push(n.id)
      }
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
