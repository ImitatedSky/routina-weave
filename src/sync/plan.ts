// 附件副檔名與匯出 zip 共用同一張對照表
import { EXTENSIONS, safeFilename } from '@/lib/zip'
import { attachmentsOf } from '@/notes/attachments'
import { toMarkdown } from '@/notes/markdown'
import type { Note } from '@/notes/types'
import type { DriveFile, SyncState, SyncedNote } from './types'

/**
 * 同步的「計畫」：只看本機筆記、雲端清單與上次同步的紀錄，決定每則筆記要做什麼。
 * 不碰網路也不碰儲存，方便單獨測試；真正執行在 engine.ts。
 */

export type NoteAction =
  /** 雲端沒有這個檔：本機新增，或雲端刪了但本機有改 */
  | { kind: 'create'; id: string }
  /** 只有本機改過 */
  | { kind: 'upload'; id: string; file: DriveFile }
  /** 只有雲端改過、雲端新增，或本機刪了但雲端有改（救回來） */
  | { kind: 'download'; id: string; file: DriveFile }
  /** 兩邊都改過，或兩邊都有但沒有同步紀錄，要看內容才能決定 */
  | { kind: 'merge'; id: string; file: DriveFile }
  /** 本機刪了、雲端沒改；同一個 weaveId 多出來的檔（duplicates）一起丟 */
  | { kind: 'trashRemote'; id: string; file: DriveFile; duplicates: DriveFile[] }
  /** 雲端刪了、本機沒改 */
  | { kind: 'removeLocal'; id: string }
  /** 兩邊都沒了，只要清掉紀錄 */
  | { kind: 'forget'; id: string }
  /** 同一個 weaveId 多出來的檔，筆記還在：內容和正本或本機一樣就丟掉，不一樣先另存衝突副本再丟 */
  | { kind: 'duplicate'; id: string; file: DriveFile; canonical: DriveFile }

export interface NotePlan {
  actions: NoteAction[]
  /** 雲端資料夾裡沒有 weaveId 的 .md（使用者自己放進去的），目前無法補標記，先略過 */
  untracked: DriveFile[]
}

export function noteFilename(note: Note): string {
  return `${safeFilename(note.title)}.md`
}

export function planNotes(notes: Record<string, Note>, files: DriveFile[], state: SyncState): NotePlan {
  // 同一個 weaveId 可能有好幾個檔（兩台同時重新上傳之類），全部收起來
  const remote = new Map<string, DriveFile[]>()
  const untracked: DriveFile[] = []
  for (const file of files) {
    const props = file.appProperties ?? {}
    if (props.weaveKind === 'note' && props.weaveId) {
      const list = remote.get(props.weaveId)
      if (list) list.push(file)
      else remote.set(props.weaveId, [file])
    } else if (!props.weaveKind && /\.md$/i.test(file.name)) {
      untracked.push(file)
    }
  }

  const ids = new Set([...Object.keys(notes), ...remote.keys(), ...Object.keys(state.notes)])
  const actions: NoteAction[] = []
  for (const id of ids) {
    const synced = state.notes[id]
    const [file, ...extras] = canonicalFirst(remote.get(id) ?? [], synced)
    const action = planNote(id, notes[id], file, extras, synced)
    if (action) actions.push(action)
    // 多出來的檔不當成「雲端改過」，不然會蓋掉正本或把刪掉的筆記救回來
    if (action?.kind !== 'trashRemote') {
      for (const extra of extras) actions.push({ kind: 'duplicate', id, file: extra, canonical: file })
    }
  }
  return { actions, untracked }
}

function planNote(
  id: string,
  note: Note | undefined,
  file: DriveFile | undefined,
  duplicates: DriveFile[],
  synced: SyncedNote | undefined,
): NoteAction | null {
  if (!synced) {
    if (note && file) return { kind: 'merge', id, file }
    if (note) return { kind: 'create', id }
    if (file) return { kind: 'download', id, file }
    return null
  }

  const localChanged = !!note && note.updated !== synced.localUpdated
  // 紀錄裡的檔不見、換成別的檔（同一個 weaveId）也算雲端改過
  const remoteChanged = !!file && (file.id !== synced.fileId || file.modifiedTime !== synced.remoteModified)

  if (note && file) {
    if (localChanged && remoteChanged) return { kind: 'merge', id, file }
    if (localChanged) return { kind: 'upload', id, file }
    if (remoteChanged) return { kind: 'download', id, file }
    return null
  }
  // 本機刪了：雲端有改就救回來，不讓另一台的修改消失
  if (file) return remoteChanged ? { kind: 'download', id, file } : { kind: 'trashRemote', id, file, duplicates }
  // 雲端刪了：本機有改就重新上傳
  if (note) return localChanged ? { kind: 'create', id } : { kind: 'removeLocal', id }
  return { kind: 'forget', id }
}

/** 正本排第一個：優先用紀錄裡那個，其次是最新的 */
function canonicalFirst(files: DriveFile[], synced: SyncedNote | undefined): DriveFile[] {
  const rank = (f: DriveFile) => (f.id === synced?.fileId ? 1 : 0)
  return [...files].sort((a, b) => rank(b) - rank(a) || b.modifiedTime.localeCompare(a.modifiedTime))
}

// ---- 兩邊都改過 ----

export type MergeResult =
  | { kind: 'same' }
  /** 以本機為正本；copy 是雲端版本另存的衝突副本 */
  | { kind: 'keepLocal'; copy: Note }
  /** 以雲端為正本；copy 是本機版本另存的衝突副本 */
  | { kind: 'keepRemote'; copy: Note }

/**
 * updated 較新的當正本（一樣新時本機優先），另一份存成衝突副本。
 * 沒有同步紀錄（重新連線、紀錄遺失、上次同步中途中斷）時也一樣：
 * 不知道較舊那份是不是只是舊版，可能是離線時改的，所以也要留著。
 */
export function resolveMerge(local: Note, remote: Note, now: Date): MergeResult {
  if (sameContent(local, remote)) return { kind: 'same' }
  const localWins = time(local.updated) >= time(remote.updated)
  if (localWins) return { kind: 'keepLocal', copy: conflictCopy(remote, local.parent, now) }
  return { kind: 'keepRemote', copy: conflictCopy(local, remote.parent, now) }
}

/** 除了 updated 以外都一樣（兩邊剛好改成同樣內容）就不算衝突 */
export function sameContent(a: Note, b: Note): boolean {
  return toMarkdown({ ...a, updated: '' }) === toMarkdown({ ...b, updated: '' })
}

export function conflictCopy(note: Note, parent: string | null, now: Date): Note {
  return {
    ...note,
    id: crypto.randomUUID(),
    title: `${note.title}（衝突副本 ${stamp(now)}）`,
    parent,
    pinned: undefined,
  }
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function time(iso: string): number {
  return Date.parse(iso) || 0
}

// ---- 附件 ----

/** 這則筆記用到的附件（規則與刪筆記時共用，見 notes/attachments.ts） */
export const attachmentsUsedBy = attachmentsOf

export interface AttachmentPlan {
  upload: string[]
  download: DriveFile[]
  /** 兩邊都有、只是紀錄裡還沒有的：附件 id → 雲端檔案 id */
  known: Record<string, string>
}

/**
 * 只處理有筆記在用的附件。本機刪筆記時會順便刪掉沒人用的附件，
 * 如果雲端有的都下載，刪掉的圖片每次同步又會被抓回來。
 */
export function planAttachments(notes: Record<string, Note>, localIds: Set<string>, files: DriveFile[], state: SyncState): AttachmentPlan {
  const used = new Set(Object.values(notes).flatMap(attachmentsUsedBy))
  const remote = new Map<string, DriveFile>()
  for (const file of files) {
    const props = file.appProperties ?? {}
    if (props.weaveKind === 'attachment' && props.weaveId) remote.set(props.weaveId, file)
  }

  const plan: AttachmentPlan = { upload: [], download: [], known: {} }
  for (const id of used) {
    const file = remote.get(id)
    if (localIds.has(id) && file) {
      if (state.attachments[id] !== file.id) plan.known[id] = file.id
    } else if (localIds.has(id)) {
      plan.upload.push(id)
    } else if (file) {
      plan.download.push(file)
    }
  }
  return plan
}

export function attachmentFilename(id: string, type: string): string {
  return `${safeFilename(id)}.${EXTENSIONS[type] ?? 'bin'}`
}

/** 雲端附件 → MIME type：先看副檔名，再看 Drive 記的 mimeType */
export function attachmentType(file: DriveFile): string {
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'jpeg') return 'image/jpeg'
  const fromExt = Object.keys(EXTENSIONS).find((type) => EXTENSIONS[type] === ext)
  // 只看副檔名，不信雲端給的 mimeType（可能被改成 svg/html 之類能跑腳本的類型）
  return fromExt ?? 'application/octet-stream'
}
