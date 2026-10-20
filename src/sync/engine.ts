import { fromMarkdown, toMarkdown } from '@/notes/markdown'
import type { Note } from '@/notes/types'
import { safeImageType } from '@/lib/imageTypes'
import {
  attachmentFilename,
  attachmentType,
  conflictCopy,
  noteFilename,
  planAttachments,
  planNotes,
  resolveMerge,
  sameContent,
  type NoteAction,
} from './plan'
import type { DriveApi, DriveFile, LocalStore, SyncResult, SyncState } from './types'

/**
 * 同步一次：列出雲端清單 → planNotes 決定每則筆記要做什麼 → 依序執行 → 附件。
 * 每做完一批就存一次 SyncState，中途斷線或關掉 App，下次會從紀錄接著做，
 * 已經建立的雲端檔案靠 appProperties 的 weaveId 認回來，不會重複建立。
 */

export interface SyncWarning {
  fileId: string
  name: string
  /** unreadable：下載下來解析失敗；untracked：資料夾裡沒有 Weave 標記的 .md，目前略過 */
  reason: 'unreadable' | 'untracked'
}

export interface SyncReport extends SyncResult {
  warnings: SyncWarning[]
}

// 一批裡的檔案同時傳，做完一批存一次紀錄
const BATCH_SIZE = 10

let running: Promise<SyncReport> | null = null

/** 同一時間只跑一次；同步中再呼叫會拿到同一個 promise */
export function syncOnce(drive: DriveApi, local: LocalStore, now = new Date()): Promise<SyncReport> {
  running ??= runSync(drive, local, now).finally(() => {
    running = null
  })
  return running
}

interface Run {
  drive: DriveApi
  local: LocalStore
  state: SyncState
  now: Date
  rootId: string
  /** 規劃時看到的本機筆記；執行前比對，使用者在同步途中又改了就先不動它 */
  snapshot: Record<string, Note>
  report: SyncReport
  /** 這一批下載下來的，批次結束時再確認一次使用者沒改過才寫回本機 */
  downloads: { note: Note; file: DriveFile }[]
  /** 衝突副本是新的 id，一定寫回本機 */
  copies: Note[]
  removals: string[]
}

async function runSync(drive: DriveApi, local: LocalStore, now: Date): Promise<SyncReport> {
  const state = await local.loadState()
  const { rootId, attachmentsId } = await drive.ensureFolders()
  // 雲端資料夾被整個刪掉又重建時，舊紀錄對不上新資料夾。當成第一次同步，
  // 不然每則筆記都會被當成「雲端刪除」而把本機刪光
  if (state.rootId && state.rootId !== rootId) {
    state.notes = {}
    state.attachments = {}
  }
  if (state.attachmentsId && state.attachmentsId !== attachmentsId) state.attachments = {}
  state.rootId = rootId
  state.attachmentsId = attachmentsId

  const run: Run = {
    drive,
    local,
    state,
    now,
    rootId,
    snapshot: local.notes(),
    report: {
      uploaded: 0,
      downloaded: 0,
      deletedLocal: 0,
      deletedRemote: 0,
      conflicts: 0,
      attachmentsUploaded: 0,
      attachmentsDownloaded: 0,
      warnings: [],
    },
    downloads: [],
    copies: [],
    removals: [],
  }

  const plan = planNotes(run.snapshot, await drive.listFiles(rootId), state)
  for (const file of plan.untracked) {
    run.report.warnings.push({ fileId: file.id, name: file.name, reason: 'untracked' })
  }
  await inBatches(run, plan.actions, (action) => runNoteAction(run, action))

  // 附件放在筆記之後：剛下載的筆記用到的圖片也要一起抓
  const localIds = new Set((await local.allAttachments()).map((a) => a.id))
  const attachments = planAttachments(local.notes(), localIds, await drive.listFiles(attachmentsId), state)
  Object.assign(state.attachments, attachments.known)
  await inBatches(run, attachments.upload, async (id) => {
    const attachment = await local.getAttachment(id)
    if (!attachment) return
    const name = attachmentFilename(id, attachment.type)
    const file = await drive.create(attachmentsId, name, attachment.blob, { weaveKind: 'attachment', weaveId: id })
    state.attachments[id] = file.id
    run.report.attachmentsUploaded++
  })
  await inBatches(run, attachments.download, async (file) => {
    const id = file.appProperties!.weaveId
    // 不相信 Drive 回的 Content-Type（上傳端可能被動過手腳）：只認點陣圖白名單，其他存成 octet-stream
    const type = safeImageType(attachmentType(file))
    const blob = await drive.download(file.id)
    await local.putAttachment({ id, type, blob: new Blob([blob], { type }) })
    state.attachments[id] = file.id
    run.report.attachmentsDownloaded++
  })

  state.lastSync = now.toISOString()
  await local.saveState(state)
  return run.report
}

/**
 * 一批同時做，全部結束後寫回本機並存紀錄，再把錯誤往外丟。
 * 用 allSettled 而不是 all：不然一個失敗就提早結束，同批其他已經成功的沒記到紀錄
 */
async function inBatches<T>(run: Run, items: T[], work: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const results = await Promise.allSettled(items.slice(i, i + BATCH_SIZE).map(work))
    // 寫本機失敗就直接丟出去，不存紀錄：不然下次會以為本機刪了而把雲端也刪掉
    await applyLocal(run)
    await run.local.saveState(run.state)
    const failed = results.find((r) => r.status === 'rejected')
    if (failed) throw failed.reason
  }
}

/**
 * 把這一批下載與刪除寫回本機。檢查「使用者沒改過」和寫入之間不能有 await，
 * 不然途中打的字會被蓋掉；改過的先跳過，下次同步會變成兩邊都改過，兩份都留。
 * 寫進 IndexedDB 之後才記紀錄。
 */
async function applyLocal(run: Run) {
  const downloads = run.downloads.splice(0).filter((d) => unchangedSincePlan(run, d.note.id))
  const removals = run.removals.splice(0).filter((id) => unchangedSincePlan(run, id))
  const upserts = [...run.copies.splice(0), ...downloads.map((d) => d.note)]
  const writes: Promise<void>[] = []
  if (upserts.length) writes.push(run.local.upsert(upserts))
  if (removals.length) writes.push(run.local.remove(removals))
  await Promise.all(writes)

  for (const { note, file } of downloads) {
    record(run.state, note.id, file, note)
    run.report.downloaded++
  }
  for (const id of removals) {
    delete run.state.notes[id]
    run.report.deletedLocal++
  }
}

async function runNoteAction(run: Run, action: NoteAction) {
  const { drive, state, report } = run
  const { id } = action
  switch (action.kind) {
    case 'create': {
      const note = run.local.notes()[id]
      if (!note) return
      await createRemote(run, note)
      return
    }
    case 'upload': {
      const note = run.local.notes()[id]
      if (!note) return
      await updateRemote(run, note, action.file)
      return
    }
    case 'download': {
      const remote = await readRemote(run, action.file, id)
      if (!remote || !unchangedSincePlan(run, id)) return
      run.downloads.push({ note: remote, file: action.file })
      return
    }
    case 'merge': {
      const remote = await readRemote(run, action.file, id)
      if (!remote || !unchangedSincePlan(run, id)) return
      const note = run.local.notes()[id]
      if (!note) return
      const merged = resolveMerge(note, remote, run.now)
      if (merged.kind === 'same') {
        record(state, id, action.file, note)
        return
      }
      // 先把會被蓋掉的那份另存上雲端，再覆蓋正本；中途失敗頂多多一份副本，不會掉資料
      await saveCopy(run, merged.copy)
      // 副本存好了，先記下這則接下來往哪邊走：後面那步失敗的話，下次只補上傳或補下載，不會再存一份副本
      if (merged.kind === 'keepLocal') {
        state.notes[id] = { fileId: action.file.id, remoteModified: action.file.modifiedTime, localUpdated: '' }
        await updateRemote(run, note, action.file)
      } else {
        state.notes[id] = { fileId: action.file.id, remoteModified: '', localUpdated: note.updated }
        run.downloads.push({ note: remote, file: action.file })
      }
      return
    }
    case 'trashRemote':
      // 重複檔先丟，正本最後丟、最後才清紀錄：中途失敗下次會再丟一次，不會被留下的重複檔救回來
      for (const extra of action.duplicates) await drive.trash(extra.id)
      await drive.trash(action.file.id)
      delete state.notes[id]
      report.deletedRemote++
      return
    case 'removeLocal':
      if (!unchangedSincePlan(run, id)) return
      run.removals.push(id)
      return
    case 'forget':
      delete state.notes[id]
      return
    case 'duplicate': {
      const extra = await readRemote(run, action.file, id)
      if (!extra) return
      const canonical = await readRemote(run, action.canonical, id)
      const note = run.local.notes()[id]
      // 只有正本和本機都沒有的內容才另存，丟掉的檔在雲端垃圾桶也還救得回來
      const known = [canonical, note].some((n) => n && sameContent(n, extra))
      // 上次已經存過副本、只是丟檔失敗的話，不要再存一份
      const copied = Object.values(run.local.notes()).some(
        (n) => n.body === extra.body && n.title.startsWith(`${extra.title}（衝突副本`),
      )
      if (!known && !copied) await saveCopy(run, conflictCopy(extra, extra.parent, run.now))
      await drive.trash(action.file.id)
      return
    }
  }
}

/** 衝突副本：本機和雲端各存一份 */
async function saveCopy(run: Run, copy: Note) {
  run.copies.push(copy)
  await createRemote(run, copy)
  run.report.conflicts++
}

async function createRemote(run: Run, note: Note) {
  const file = await run.drive.create(run.rootId, noteFilename(note), noteBlob(note), {
    weaveKind: 'note',
    weaveId: note.id,
  })
  record(run.state, note.id, file, note)
  run.report.uploaded++
}

async function updateRemote(run: Run, note: Note, current: DriveFile) {
  const name = noteFilename(note)
  const file = await run.drive.update(current.id, noteBlob(note), name !== current.name ? name : undefined)
  record(run.state, note.id, file, note)
  run.report.uploaded++
}

/** 下載並解析；壞檔記成 warning 回傳 null，不讓整次同步失敗 */
async function readRemote(run: Run, file: DriveFile, id: string): Promise<Note | null> {
  const text = await (await run.drive.download(file.id)).text()
  const note = fromMarkdown(text, file.name.replace(/\.md$/i, ''))
  if (!note) {
    // 重複檔比對時正本可能會讀第二次，同一個檔只記一次
    if (!run.report.warnings.some((w) => w.fileId === file.id)) {
      run.report.warnings.push({ fileId: file.id, name: file.name, reason: 'unreadable' })
    }
    return null
  }
  // 以 appProperties 的 weaveId 為準，frontmatter 的 id 被別的編輯器改掉也還是同一則
  return { ...note, id }
}

function unchangedSincePlan(run: Run, id: string): boolean {
  return run.local.notes()[id]?.updated === run.snapshot[id]?.updated
}

function record(state: SyncState, id: string, file: DriveFile, note: Note) {
  state.notes[id] = { fileId: file.id, remoteModified: file.modifiedTime, localUpdated: note.updated }
}

function noteBlob(note: Note): Blob {
  return new Blob([toMarkdown(note)], { type: 'text/markdown' })
}
