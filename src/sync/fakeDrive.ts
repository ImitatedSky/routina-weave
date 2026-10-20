import type { DriveApi, DriveFile, DriveUser } from './types'

/**
 * 記憶體版的 DriveApi，給同步引擎的測試用。行為照真的 Drive：
 * 每次建立、修改、改名都換一個新的 modifiedTime（這裡每次加一秒），丟垃圾桶的檔案列不出來。
 * 「另一台裝置」或使用者直接在雲端硬碟動檔案，用 putExternal / editExternal / trashExternal 模擬。
 */

const FOLDER = 'application/vnd.google-apps.folder'

type Method = 'ensureFolders' | 'listFiles' | 'download' | 'create' | 'update' | 'trash' | 'getUser'

interface StoredFile extends DriveFile {
  parent: string
  content: Blob
  trashed: boolean
}

interface Failure {
  method: Method
  error: Error
  /** 還要放過幾次呼叫才失敗 */
  skip: number
  /** true：先做完再丟錯，模擬伺服器已經寫入但回應沒收到 */
  afterWork: boolean
}

export class FakeDrive implements DriveApi {
  files = new Map<string, StoredFile>()
  calls: Record<Method, number> = {
    ensureFolders: 0,
    listFiles: 0,
    download: 0,
    create: 0,
    update: 0,
    trash: 0,
    getUser: 0,
  }

  private clock = Date.parse('2026-01-01T00:00:00.000Z')
  private seq = 0
  private failures: Failure[] = []

  /** 第 nth 次（從下一次算起）呼叫 method 時丟 error */
  failOn(method: Method, error: Error = new Error('network'), options: { nth?: number; afterWork?: boolean } = {}) {
    this.failures.push({ method, error, skip: (options.nth ?? 1) - 1, afterWork: options.afterWork ?? false })
  }

  async ensureFolders() {
    return this.call('ensureFolders', () => {
      const root =
        this.live().find((f) => f.appProperties?.weaveKind === 'root') ??
        this.add('', 'Routina Weave', new Blob([]), { weaveKind: 'root' }, FOLDER)
      const attachments =
        this.live().find((f) => f.appProperties?.weaveKind === 'attachments' && f.parent === root.id) ??
        this.add(root.id, '_attachments', new Blob([]), { weaveKind: 'attachments' }, FOLDER)
      return { rootId: root.id, attachmentsId: attachments.id }
    })
  }

  async listFiles(folderId: string) {
    return this.call('listFiles', () => this.live().filter((f) => f.parent === folderId).map(publicFile))
  }

  async download(fileId: string) {
    return this.call('download', () => this.get(fileId).content)
  }

  async create(folderId: string, name: string, content: Blob, appProperties: Record<string, string>) {
    return this.call('create', () => publicFile(this.add(folderId, name, content, appProperties, content.type)))
  }

  async update(fileId: string, content: Blob, name?: string) {
    return this.call('update', () => {
      const file = this.get(fileId)
      file.content = content
      if (name !== undefined) file.name = name
      file.modifiedTime = this.tick()
      return publicFile(file)
    })
  }

  async trash(fileId: string) {
    return this.call('trash', () => {
      this.get(fileId).trashed = true
    })
  }

  user: DriveUser = { displayName: '測試', emailAddress: 'test@example.com', permissionId: 'user-1' }

  async getUser(): Promise<DriveUser> {
    return this.call('getUser', () => ({ ...this.user }))
  }

  // ---- 模擬別人動雲端（不算進 calls，也不會觸發 failOn） ----

  putExternal(folderId: string, name: string, text: string, appProperties?: Record<string, string>): DriveFile {
    return publicFile(this.add(folderId, name, new Blob([text], { type: 'text/markdown' }), appProperties, 'text/markdown'))
  }

  editExternal(fileId: string, text: string, name?: string) {
    const file = this.get(fileId)
    file.content = new Blob([text], { type: 'text/markdown' })
    if (name !== undefined) file.name = name
    file.modifiedTime = this.tick()
  }

  trashExternal(fileId: string) {
    this.get(fileId).trashed = true
  }

  /** 沒丟垃圾桶、標記為某種 weaveKind 的檔案 */
  filesOfKind(kind: string): DriveFile[] {
    return this.live()
      .filter((f) => f.appProperties?.weaveKind === kind)
      .map(publicFile)
  }

  findNote(id: string): DriveFile | undefined {
    return this.filesOfKind('note').find((f) => f.appProperties?.weaveId === id)
  }

  async textOf(fileId: string): Promise<string> {
    return this.get(fileId).content.text()
  }

  // ---- 內部 ----

  private async call<T>(method: Method, work: () => T): Promise<T> {
    this.calls[method]++
    const failure = this.takeFailure(method)
    if (failure && !failure.afterWork) throw failure.error
    const value = work()
    if (failure) throw failure.error
    return value
  }

  private takeFailure(method: Method): Failure | undefined {
    const index = this.failures.findIndex((f) => f.method === method)
    if (index < 0) return undefined
    const failure = this.failures[index]
    if (failure.skip > 0) {
      failure.skip--
      return undefined
    }
    this.failures.splice(index, 1)
    return failure
  }

  private live(): StoredFile[] {
    return [...this.files.values()].filter((f) => !f.trashed)
  }

  private get(fileId: string): StoredFile {
    const file = this.files.get(fileId)
    if (!file) throw new Error(`沒有這個檔案：${fileId}`)
    return file
  }

  private add(parent: string, name: string, content: Blob, appProperties: Record<string, string> | undefined, mimeType: string) {
    const file: StoredFile = {
      id: `file${++this.seq}`,
      name,
      modifiedTime: this.tick(),
      mimeType,
      appProperties: appProperties ? { ...appProperties } : undefined,
      parent,
      content,
      trashed: false,
    }
    this.files.set(file.id, file)
    return file
  }

  private tick(): string {
    this.clock += 1000
    return new Date(this.clock).toISOString()
  }
}

function publicFile(file: StoredFile): DriveFile {
  return {
    id: file.id,
    name: file.name,
    modifiedTime: file.modifiedTime,
    mimeType: file.mimeType,
    appProperties: file.appProperties ? { ...file.appProperties } : undefined,
  }
}
