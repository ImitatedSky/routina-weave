import { TokenExpiredError, type DriveApi, type DriveFile, type DriveUser, type TokenProvider } from './types'

/**
 * Google Drive REST API v3 用戶端，純 fetch，不用 gapi。
 * 權限只有 drive.file：只看得到 App 自己建立的檔案，所以查詢一律限定 parent 與 trashed = false。
 */

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const FILE_FIELDS = 'id,name,modifiedTime,md5Checksum,mimeType,appProperties'

const MAX_RETRIES = 3
const MAX_RETRY_DELAY = 60_000

/** Drive 回錯誤（非 401）時丟這個 */
export class DriveError extends Error {
  status: number
  reason?: string

  constructor(message: string, status: number, reason?: string) {
    super(message)
    this.name = 'DriveError'
    this.status = status
    this.reason = reason
  }
}

/** fetch 本身失敗（離線、DNS、CORS 被擋），上層看 name 顯示「離線」 */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('無法連線到 Google 雲端硬碟', { cause })
    this.name = 'NetworkError'
  }
}

/** q 裡的字串值要跳脫反斜線與單引號 */
export function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function createDriveApi(getToken: TokenProvider): DriveApi {
  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    let token = await getToken({ interactive: false })
    let refreshed = false
    let retries = 0

    for (;;) {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${token}`)
      let res: Response
      try {
        res = await fetch(url, { ...init, headers })
      } catch (err) {
        throw new NetworkError(err)
      }
      if (res.ok) return res

      // token 過期：重拿一次再試，還是 401 就交給上層處理
      if (res.status === 401) {
        if (refreshed) throw new TokenExpiredError()
        refreshed = true
        token = await getToken({ interactive: false, forceRefresh: true })
        continue
      }

      const reason = await readReason(res)
      // 建立檔案（POST）遇到 5xx 不重試：伺服器可能其實已經建好，重送會多一個同 weaveId 的檔。
      // 交給同步引擎下次重跑，靠 weaveId 認回來；429 與限流是還沒處理就被擋，可以重送
      const retryable = init.method === 'POST' ? isRateLimited(res.status, reason) : isRetryable(res.status, reason)
      if (retryable && retries < MAX_RETRIES) {
        await sleep(retryDelay(res, retries))
        retries++
        continue
      }
      throw toDriveError(res.status, reason)
    }
  }

  async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await request(url, init)
    return (await res.json()) as T
  }

  async function findFolders(q: string): Promise<{ id: string }[]> {
    const params = new URLSearchParams({
      q,
      spaces: 'drive',
      fields: 'files(id,createdTime)',
      orderBy: 'createdTime',
      pageSize: '10',
    })
    const data = await requestJson<{ files?: { id: string }[] }>(`${API}/files?${params}`)
    return data.files ?? []
  }

  async function createFolder(name: string, parent: string, kind: string): Promise<string> {
    const params = new URLSearchParams({ fields: 'id' })
    const data = await requestJson<{ id: string }>(`${API}/files?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent], appProperties: { weaveKind: kind } }),
    })
    return data.id
  }

  /** 用 appProperties 找資料夾；兩台裝置同時首次同步可能建出兩個，一律取最早建立的 */
  async function ensureFolder(kind: string, name: string, parent: string | null): Promise<string> {
    let q = `mimeType = '${FOLDER_MIME}' and appProperties has { key='weaveKind' and value='${escapeQuery(kind)}' } and trashed = false`
    if (parent) q += ` and '${escapeQuery(parent)}' in parents`
    const found = await findFolders(q)
    if (found.length > 0) return found[0].id
    return createFolder(name, parent ?? 'root', kind)
  }

  return {
    async ensureFolders() {
      // 根資料夾不限 parent：使用者把它搬到別的資料夾也找得到
      const rootId = await ensureFolder('root', 'Routina Weave', null)
      const attachmentsId = await ensureFolder('attachments', '_attachments', rootId)
      return { rootId, attachmentsId }
    },

    async listFiles(folderId) {
      const files: DriveFile[] = []
      let pageToken: string | undefined
      do {
        const params = new URLSearchParams({
          q: `'${escapeQuery(folderId)}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`,
          spaces: 'drive',
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          pageSize: '1000',
        })
        if (pageToken) params.set('pageToken', pageToken)
        const data = await requestJson<{ files?: DriveFile[]; nextPageToken?: string }>(`${API}/files?${params}`)
        files.push(...(data.files ?? []))
        pageToken = data.nextPageToken
      } while (pageToken)
      return files
    },

    async download(fileId) {
      const params = new URLSearchParams({ alt: 'media' })
      const res = await request(`${API}/files/${encodeURIComponent(fileId)}?${params}`)
      return res.blob()
    },

    async create(folderId, name, content, appProperties) {
      const params = new URLSearchParams({ uploadType: 'multipart', fields: FILE_FIELDS })
      const metadata = { name, parents: [folderId], appProperties, mimeType: content.type || 'application/octet-stream' }
      return requestJson<DriveFile>(`${UPLOAD}/files?${params}`, { method: 'POST', ...multipart(metadata, content) })
    },

    async update(fileId, content, name) {
      const params = new URLSearchParams({ uploadType: 'multipart', fields: FILE_FIELDS })
      const metadata = name === undefined ? {} : { name }
      return requestJson<DriveFile>(`${UPLOAD}/files/${encodeURIComponent(fileId)}?${params}`, {
        method: 'PATCH',
        ...multipart(metadata, content),
      })
    },

    async trash(fileId) {
      const params = new URLSearchParams({ fields: 'id' })
      await request(`${API}/files/${encodeURIComponent(fileId)}?${params}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ trashed: true }),
      })
    },

    async getUser() {
      const params = new URLSearchParams({ fields: 'user(displayName,emailAddress,permissionId)' })
      const data = await requestJson<{ user?: DriveUser }>(`${API}/about?${params}`)
      return data.user ?? {}
    },
  }
}

/** multipart/related：第一段 metadata JSON，第二段檔案內容 */
function multipart(metadata: object, content: Blob): { headers: Record<string, string>; body: Blob } {
  const boundary = `weave-${crypto.randomUUID()}`
  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${content.type || 'application/octet-stream'}\r\n\r\n`,
    content,
    `\r\n--${boundary}--`,
  ])
  return { headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
}

/** Drive 的錯誤格式是 { error: { errors: [{ reason }], status } } */
async function readReason(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.json()) as { error?: { errors?: { reason?: string }[]; status?: string } }
    return data.error?.errors?.[0]?.reason ?? data.error?.status
  } catch {
    return undefined
  }
}

function isRetryable(status: number, reason?: string): boolean {
  return status >= 500 || isRateLimited(status, reason)
}

function isRateLimited(status: number, reason?: string): boolean {
  if (status === 429) return true
  return status === 403 && (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded')
}

/** 有 Retry-After 就照它（秒數或日期），否則 1s、2s、4s */
function retryDelay(res: Response, retries: number): number {
  const header = res.headers.get('Retry-After')
  if (header) {
    const seconds = Number(header)
    const ms = Number.isNaN(seconds) ? Date.parse(header) - Date.now() : seconds * 1000
    if (!Number.isNaN(ms)) return Math.min(Math.max(ms, 0), MAX_RETRY_DELAY)
  }
  return 1000 * 2 ** retries
}

function toDriveError(status: number, reason?: string): DriveError {
  const detail = reason ? `HTTP ${status}，${reason}` : `HTTP ${status}`
  let message: string
  if (status === 404) message = `雲端硬碟上找不到這個檔案（${detail}）`
  else if (status === 403) message = `沒有權限存取雲端硬碟的檔案（${detail}）`
  else if (isRetryable(status, reason)) message = `Google 雲端硬碟忙碌中，請稍後再試（${detail}）`
  else message = `Google 雲端硬碟請求失敗（${detail}）`
  return new DriveError(message, status, reason)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
