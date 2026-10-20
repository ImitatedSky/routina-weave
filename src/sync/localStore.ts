import { useNotes } from '@/store/notes'
import * as db from '@/storage/db'
import type { LocalStore, SyncState } from './types'

const STATE_KEY = 'drive-sync-state'

/** 同步引擎讀寫本機資料的地方：筆記走 store（畫面會跟著更新），同步狀態存在 IndexedDB 的 meta */
export const localStore: LocalStore = {
  notes: () => useNotes.getState().notes,
  upsert: (notes) => useNotes.getState().importNotes(notes),
  remove: (ids) => useNotes.getState().removeNotes(ids),
  allAttachments: () => db.allAttachments(),
  getAttachment: (id) => db.getAttachment(id),
  putAttachment: (attachment) => db.putAttachment(attachment),
  loadState: async () => (await db.getMeta<SyncState>(STATE_KEY)) ?? { notes: {}, attachments: {} },
  saveState: (state) => db.setMeta(STATE_KEY, state),
}

/** 中斷連線時清掉同步狀態：下次連線（可能是別的帳號）要從頭比對，不能沿用舊帳號的檔案 id */
export function clearSyncState(): Promise<void> {
  return db.setMeta(STATE_KEY, { notes: {}, attachments: {} } satisfies SyncState)
}
