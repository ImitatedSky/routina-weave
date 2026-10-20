import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Note } from '@/notes/types'
import { safeAttachment } from '@/lib/imageTypes'

/**
 * 本機儲存。筆記存成結構化物件（不是 .md 字串），讀寫快、也好建索引；
 * 對外的 .md 格式只在匯出／同步時用 markdown.ts 轉換。
 */

export interface Attachment {
  id: string
  blob: Blob
  type: string
}

interface WeaveDB extends DBSchema {
  notes: { key: string; value: Note }
  attachments: { key: string; value: Attachment }
  meta: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<WeaveDB>> | null = null

function db() {
  dbPromise ??= openDB<WeaveDB>('routina-weave', 1, {
    upgrade(database) {
      database.createObjectStore('notes', { keyPath: 'id' })
      database.createObjectStore('attachments', { keyPath: 'id' })
      database.createObjectStore('meta')
    },
  })
  return dbPromise
}

export async function loadNotes(): Promise<Note[]> {
  return (await db()).getAll('notes')
}

export async function saveNote(note: Note): Promise<void> {
  await (await db()).put('notes', note)
}

export async function saveNotes(notes: Note[]): Promise<void> {
  const tx = (await db()).transaction('notes', 'readwrite')
  await Promise.all([...notes.map((n) => tx.store.put(n)), tx.done])
}

export async function deleteNotes(ids: string[]): Promise<void> {
  const tx = (await db()).transaction('notes', 'readwrite')
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
}

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  return (await db()).get('attachments', id)
}

/** 所有附件都從這裡存：不是點陣圖的一律存成 application/octet-stream（見 lib/imageTypes.ts） */
export async function putAttachment(attachment: Attachment): Promise<void> {
  await (await db()).put('attachments', safeAttachment(attachment))
}

export async function deleteAttachment(id: string): Promise<void> {
  await (await db()).delete('attachments', id)
}

export async function allAttachments(): Promise<Attachment[]> {
  return (await db()).getAll('attachments')
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key)
}
