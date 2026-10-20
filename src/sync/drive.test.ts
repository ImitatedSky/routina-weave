import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDriveApi, escapeQuery } from './drive'
import { NotSignedInError, TokenExpiredError, type TokenProvider } from './types'

const TOKEN = 'secret-token-abc'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
let getToken: ReturnType<typeof vi.fn<TokenProvider>>

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
  getToken = vi.fn<TokenProvider>().mockResolvedValue(TOKEN)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function api() {
  return createDriveApi(getToken)
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function fail(status: number, reason?: string, headers?: Record<string, string>) {
  const body = { error: { code: status, errors: reason ? [{ reason }] : [] } }
  return new Response(JSON.stringify(body), { status, headers })
}

/** 第 i 次 fetch 的網址、方法、標頭、body */
function call(i: number) {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit]
  return { url: new URL(url), method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body }
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

/** 拆 multipart/related body，回傳 metadata 與內容段 */
async function parseMultipart(headers: Headers, body: unknown) {
  const contentType = headers.get('Content-Type')!
  const match = /^multipart\/related; boundary=(.+)$/.exec(contentType)
  expect(match).not.toBeNull()
  const boundary = match![1]
  const text = await readBlob(body as Blob)
  expect(text.startsWith(`--${boundary}\r\n`)).toBe(true)
  expect(text.endsWith(`\r\n--${boundary}--`)).toBe(true)
  const parts = text.slice(`--${boundary}\r\n`.length, -`\r\n--${boundary}--`.length).split(`\r\n--${boundary}\r\n`)
  expect(parts).toHaveLength(2)
  const [metaHead, metaBody] = parts[0].split('\r\n\r\n')
  const [contentHead, ...rest] = parts[1].split('\r\n\r\n')
  return { metaHead, metadata: JSON.parse(metaBody), contentHead, content: rest.join('\r\n\r\n') }
}

describe('請求格式', () => {
  it('帶 Bearer token、用非互動方式拿 token', async () => {
    fetchMock.mockResolvedValueOnce(json({ user: { displayName: '小明', emailAddress: 'a@b.c' } }))
    expect(await api().getUser()).toEqual({ displayName: '小明', emailAddress: 'a@b.c' })
    const { url, headers } = call(0)
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/drive/v3/about')
    expect(url.searchParams.get('fields')).toBe('user(displayName,emailAddress,permissionId)')
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`)
    expect(getToken).toHaveBeenCalledWith({ interactive: false })
  })

  it('listFiles 限定 parent、排除垃圾桶，並自動翻頁', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ files: [{ id: '1', name: 'a.md' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(json({ files: [{ id: '2', name: 'b.md' }] }))
    const files = await api().listFiles('folder1')
    expect(files.map((f) => f.id)).toEqual(['1', '2'])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const first = call(0).url
    expect(first.pathname).toBe('/drive/v3/files')
    expect(first.searchParams.get('q')).toBe(`'folder1' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`)
    expect(first.searchParams.get('spaces')).toBe('drive')
    expect(first.searchParams.get('pageSize')).toBe('1000')
    expect(first.searchParams.get('fields')).toBe('nextPageToken,files(id,name,modifiedTime,md5Checksum,mimeType,appProperties)')
    expect(first.searchParams.has('pageToken')).toBe(false)
    expect(call(1).url.searchParams.get('pageToken')).toBe('p2')
  })

  it('download 用 alt=media 回傳 Blob', async () => {
    fetchMock.mockResolvedValueOnce(new Response('# 標題'))
    const blob = await api().download('id/1')
    expect(await blob.text()).toBe('# 標題')
    const { url } = call(0)
    expect(url.pathname).toBe('/drive/v3/files/id%2F1')
    expect(url.searchParams.get('alt')).toBe('media')
  })

  it('create 用 multipart 上傳，metadata 正確、中文檔名正常', async () => {
    const file = { id: 'new', name: '筆記.md', modifiedTime: '2026-10-21T00:00:00.000Z' }
    fetchMock.mockResolvedValueOnce(json(file))
    const content = new Blob(['# 你好\n內容'], { type: 'text/markdown' })
    expect(await api().create('root1', '筆記.md', content, { weaveKind: 'note', weaveId: 'n1' })).toEqual(file)

    const { url, method, headers, body } = call(0)
    expect(method).toBe('POST')
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/upload/drive/v3/files')
    expect(url.searchParams.get('uploadType')).toBe('multipart')
    expect(url.searchParams.get('fields')).toBe('id,name,modifiedTime,md5Checksum,mimeType,appProperties')
    const parts = await parseMultipart(headers, body)
    expect(parts.metaHead).toBe('Content-Type: application/json; charset=UTF-8')
    expect(parts.metadata).toEqual({
      name: '筆記.md',
      parents: ['root1'],
      appProperties: { weaveKind: 'note', weaveId: 'n1' },
      mimeType: 'text/markdown',
    })
    expect(parts.contentHead).toBe('Content-Type: text/markdown')
    expect(parts.content).toBe('# 你好\n內容')
  })

  it('update 用 PATCH multipart，有 name 才帶 name', async () => {
    fetchMock.mockImplementation(async () => json({ id: 'f1', name: 'x', modifiedTime: 't' }))
    const content = new Blob(['新內容'], { type: 'text/markdown' })

    await api().update('f1', content, '改名.md')
    let req = call(0)
    expect(req.method).toBe('PATCH')
    expect(req.url.origin + req.url.pathname).toBe('https://www.googleapis.com/upload/drive/v3/files/f1')
    expect(req.url.searchParams.get('uploadType')).toBe('multipart')
    let parts = await parseMultipart(req.headers, req.body)
    expect(parts.metadata).toEqual({ name: '改名.md' })
    expect(parts.content).toBe('新內容')

    await api().update('f1', content)
    req = call(1)
    parts = await parseMultipart(req.headers, req.body)
    expect(parts.metadata).toEqual({})
  })

  it('trash 是 PATCH trashed: true', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'f1' }))
    await api().trash('f1')
    const { url, method, headers, body } = call(0)
    expect(method).toBe('PATCH')
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/drive/v3/files/f1')
    expect(headers.get('Content-Type')).toContain('application/json')
    expect(JSON.parse(body as string)).toEqual({ trashed: true })
  })

  it('q 裡的單引號與反斜線會跳脫', async () => {
    expect(escapeQuery("a'b\\c")).toBe("a\\'b\\\\c")
    fetchMock.mockResolvedValueOnce(json({ files: [] }))
    await api().listFiles("it's\\x")
    expect(call(0).url.searchParams.get('q')).toBe(`'it\\'s\\\\x' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`)
  })
})

describe('ensureFolders', () => {
  it('兩個資料夾都已存在就直接用', async () => {
    fetchMock.mockResolvedValueOnce(json({ files: [{ id: 'R' }] })).mockResolvedValueOnce(json({ files: [{ id: 'A' }] }))
    expect(await api().ensureFolders()).toEqual({ rootId: 'R', attachmentsId: 'A' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const rootQuery = call(0).url
    expect(rootQuery.searchParams.get('q')).toBe(
      `mimeType = '${FOLDER_MIME}' and appProperties has { key='weaveKind' and value='root' } and trashed = false`,
    )
    expect(rootQuery.searchParams.get('spaces')).toBe('drive')
    expect(rootQuery.searchParams.get('orderBy')).toBe('createdTime')
    expect(call(1).url.searchParams.get('q')).toBe(
      `mimeType = '${FOLDER_MIME}' and appProperties has { key='weaveKind' and value='attachments' } and trashed = false and 'R' in parents`,
    )
  })

  it('找不到就建立', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: 'R' }))
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: 'A' }))
    expect(await api().ensureFolders()).toEqual({ rootId: 'R', attachmentsId: 'A' })

    const createRoot = call(1)
    expect(createRoot.method).toBe('POST')
    expect(createRoot.url.origin + createRoot.url.pathname).toBe('https://www.googleapis.com/drive/v3/files')
    expect(JSON.parse(createRoot.body as string)).toEqual({
      name: 'Routina Weave',
      mimeType: FOLDER_MIME,
      parents: ['root'],
      appProperties: { weaveKind: 'root' },
    })
    expect(JSON.parse(call(3).body as string)).toEqual({
      name: '_attachments',
      mimeType: FOLDER_MIME,
      parents: ['R'],
      appProperties: { weaveKind: 'attachments' },
    })
  })

  it('有多個時取最早建立的（依 createdTime 排序的第一個）', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ files: [{ id: 'old', createdTime: '2026-01-01T00:00:00Z' }, { id: 'new', createdTime: '2026-02-01T00:00:00Z' }] }))
      .mockResolvedValueOnce(json({ files: [{ id: 'A1' }, { id: 'A2' }] }))
    expect(await api().ensureFolders()).toEqual({ rootId: 'old', attachmentsId: 'A1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('錯誤處理', () => {
  it('401 重拿 token 後重試一次', async () => {
    getToken.mockResolvedValueOnce('old-token').mockResolvedValueOnce('new-token')
    fetchMock.mockResolvedValueOnce(fail(401)).mockResolvedValueOnce(json({ user: {} }))
    await api().getUser()
    expect(getToken).toHaveBeenCalledTimes(2)
    // 第二次要叫 auth 丟掉快取，不然拿回來的還是同一個失效的 token
    expect(getToken).toHaveBeenLastCalledWith({ interactive: false, forceRefresh: true })
    expect(call(0).headers.get('Authorization')).toBe('Bearer old-token')
    expect(call(1).headers.get('Authorization')).toBe('Bearer new-token')
  })

  it('連續兩次 401 丟 TokenExpiredError', async () => {
    fetchMock.mockImplementation(async () => fail(401))
    await expect(api().getUser()).rejects.toBeInstanceOf(TokenExpiredError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('NotSignedInError 原樣往外丟，不發請求', async () => {
    getToken.mockRejectedValueOnce(new NotSignedInError())
    await expect(api().getUser()).rejects.toBeInstanceOf(NotSignedInError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('429 與 503 指數退避後成功', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(json({ user: { displayName: 'ok' } }))
    const promise = api().getUser()

    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(await promise).toEqual({ displayName: 'ok' })
  })

  it('尊重 Retry-After', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(fail(429, undefined, { 'Retry-After': '5' })).mockResolvedValueOnce(json({ user: {} }))
    const promise = api().getUser()
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await promise
  })

  it('一直 5xx 重試 3 次後放棄', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => fail(500, 'backendError'))
    const promise = api().getUser()
    const assertion = expect(promise).rejects.toMatchObject({ name: 'DriveError', status: 500, reason: 'backendError' })
    await vi.advanceTimersByTimeAsync(7000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('403 rateLimitExceeded 當限流重試', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(fail(403, 'userRateLimitExceeded')).mockResolvedValueOnce(json({ user: {} }))
    const promise = api().getUser()
    await vi.advanceTimersByTimeAsync(1000)
    await promise
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('create 遇到 5xx 不重試：伺服器可能已經建好，重送會多一個重複的檔', async () => {
    fetchMock.mockResolvedValueOnce(fail(503, 'backendError'))
    const content = new Blob(['x'], { type: 'text/markdown' })
    await expect(api().create('root1', 'a.md', content, { weaveKind: 'note', weaveId: 'n1' })).rejects.toMatchObject({
      name: 'DriveError',
      status: 503,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('create 遇到 429 照樣退避重試（還沒處理就被擋下）', async () => {
    vi.useFakeTimers()
    const file = { id: 'new', name: 'a.md', modifiedTime: '2026-10-21T00:00:00.000Z' }
    fetchMock.mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(json(file))
    const promise = api().create('root1', 'a.md', new Blob(['x']), { weaveKind: 'note', weaveId: 'n1' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(await promise).toEqual(file)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('update 遇到 5xx 一樣重試（同一個檔重送不會多出檔案）', async () => {
    vi.useFakeTimers()
    const file = { id: 'f1', name: 'a.md', modifiedTime: '2026-10-21T00:00:00.000Z' }
    fetchMock.mockResolvedValueOnce(fail(500)).mockResolvedValueOnce(json(file))
    const promise = api().update('f1', new Blob(['x']))
    await vi.advanceTimersByTimeAsync(1000)
    expect(await promise).toEqual(file)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('其他 403 直接丟出，不重試', async () => {
    fetchMock.mockResolvedValueOnce(fail(403, 'insufficientFilePermissions'))
    await expect(api().trash('f1')).rejects.toMatchObject({
      name: 'DriveError',
      status: 403,
      message: expect.stringContaining('insufficientFilePermissions'),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('404 的錯誤訊息清楚，含狀態與 reason', async () => {
    fetchMock.mockResolvedValueOnce(fail(404, 'notFound'))
    await expect(api().download('gone')).rejects.toThrow('雲端硬碟上找不到這個檔案（HTTP 404，notFound）')
  })

  it('fetch 失敗丟 NetworkError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api().listFiles('x')).rejects.toMatchObject({ name: 'NetworkError' })
  })

  it('錯誤訊息與 console 都不含 token', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const errors: unknown[] = []
    const responses = [fail(404, 'notFound'), fail(403, 'forbidden'), fail(400, 'badRequest'), fail(401), fail(401)]
    for (const res of responses) fetchMock.mockResolvedValueOnce(res)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    for (let i = 0; i < 5; i++) {
      await api().getUser().catch((err) => errors.push(err))
    }
    expect(errors).toHaveLength(5)
    for (const err of errors) {
      const text = `${(err as Error).name} ${(err as Error).message} ${(err as Error).stack} ${JSON.stringify(err)}`
      expect(text).not.toContain(TOKEN)
    }
    for (const spy of spies) {
      for (const args of spy.mock.calls) expect(JSON.stringify(args)).not.toContain(TOKEN)
    }
  })
})
