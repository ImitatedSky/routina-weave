import type { Note } from '@/notes/types'
import type { Attachment } from '@/storage/db'

/**
 * Google 雲端同步的介面。三個部分各自實作、互相只透過這裡的型別溝通：
 *   drive.ts   DriveApi：Drive REST API（只用 drive.file 權限）
 *   auth.ts    TokenProvider：網頁用 Google Identity Services，Android 走原生 bridge
 *   engine.ts  同步演算法：比對本機與雲端，決定上傳、下載、刪除、衝突
 *
 * 雲端的樣子：我的雲端硬碟/Routina Weave/ 底下每則筆記一個 .md（格式同匯出，見 notes/markdown.ts），
 * 附件放在 Routina Weave/_attachments/<附件 id>.<副檔名>。
 * 每個檔案用 appProperties 標記 weaveKind（'note' | 'attachment' | 'root' | 'attachments'）與 weaveId，
 * 對應本機時看 appProperties，不看檔名（檔名只是方便在雲端硬碟裡閱讀，同名也沒關係）。
 */

export interface DriveFile {
  id: string
  name: string
  /** RFC 3339，Drive 每次內容或名稱變動都會更新 */
  modifiedTime: string
  md5Checksum?: string
  mimeType?: string
  appProperties?: Record<string, string>
}

export interface DriveUser {
  displayName?: string
  emailAddress?: string
  /** Google 帳號在 Drive 的固定 id，用來確認重新連線的是同一個帳號 */
  permissionId?: string
}

export interface DriveApi {
  /** 找到或建立根資料夾「Routina Weave」與子資料夾「_attachments」（用 appProperties 找，不看名稱） */
  ensureFolders(): Promise<{ rootId: string; attachmentsId: string }>
  /** 資料夾底下所有沒被丟到垃圾桶的檔案（自動翻頁） */
  listFiles(folderId: string): Promise<DriveFile[]>
  download(fileId: string): Promise<Blob>
  create(folderId: string, name: string, content: Blob, appProperties: Record<string, string>): Promise<DriveFile>
  /** 改內容；有給 name 就一起改名 */
  update(fileId: string, content: Blob, name?: string): Promise<DriveFile>
  /** 丟到垃圾桶（使用者還救得回來），不是永久刪除 */
  trash(fileId: string): Promise<void>
  getUser(): Promise<DriveUser>
}

/**
 * 拿一個有效的 access token。interactive=false 時不能跳任何畫面，拿不到就丟 NotSignedInError。
 * forceRefresh=true：Drive 剛回 401，手上的 token 已經失效，要丟掉快取重新拿（拿不到一樣丟 NotSignedInError）
 */
export type TokenProvider = (options: { interactive: boolean; forceRefresh?: boolean }) => Promise<string>

export class NotSignedInError extends Error {
  constructor(message = '尚未連線 Google 帳號') {
    super(message)
    this.name = 'NotSignedInError'
  }
}

/** Drive 回 401 時丟這個，讓呼叫端知道要重新拿 token */
export class TokenExpiredError extends Error {
  constructor() {
    super('Google 授權已過期')
    this.name = 'TokenExpiredError'
  }
}

/** 每則筆記上次同步時的樣子，用來判斷「哪一邊改過」 */
export interface SyncedNote {
  fileId: string
  /** 上次同步後雲端檔案的 modifiedTime */
  remoteModified: string
  /** 上次同步後本機筆記的 updated */
  localUpdated: string
}

export interface SyncState {
  rootId?: string
  attachmentsId?: string
  notes: Record<string, SyncedNote>
  /** 附件 id → 雲端檔案 id。附件內容不會變（新圖片一定是新 id），所以只要記有沒有傳過 */
  attachments: Record<string, string>
  lastSync?: string
  /** 第一次同步時的帳號（permissionId），之後換成別的帳號就暫停同步 */
  account?: string
  accountEmail?: string
}

/** 同步時對本機的讀寫，由 store 那邊提供（engine 不直接碰 zustand 或 IndexedDB） */
export interface LocalStore {
  notes(): Record<string, Note>
  /**
   * 新增或覆蓋（雲端下載下來的筆記），不要改 updated。
   * 畫面上的資料要在呼叫當下就換好（不能等 await），promise 等的是寫進 IndexedDB
   */
  upsert(notes: Note[]): Promise<void>
  /** 只刪這幾則，不連帶刪子頁面（雲端刪掉的是單一檔案）；一樣當下就刪，promise 等寫入完成 */
  remove(ids: string[]): Promise<void>
  allAttachments(): Promise<Attachment[]>
  getAttachment(id: string): Promise<Attachment | undefined>
  putAttachment(attachment: Attachment): Promise<void>
  loadState(): Promise<SyncState>
  saveState(state: SyncState): Promise<void>
}

export interface SyncResult {
  uploaded: number
  downloaded: number
  deletedLocal: number
  deletedRemote: number
  /** 兩邊都改過，另存一份「衝突副本」的數量 */
  conflicts: number
  attachmentsUploaded: number
  attachmentsDownloaded: number
}
