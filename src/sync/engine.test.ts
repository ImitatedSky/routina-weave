import { beforeEach, describe, expect, it } from 'vitest'
import { fromMarkdown, toMarkdown } from '@/notes/markdown'
import type { Note } from '@/notes/types'
import type { Attachment } from '@/storage/db'
import { syncOnce } from './engine'
import { FakeDrive } from './fakeDrive'
import { NotSignedInError, TokenExpiredError, type LocalStore, type SyncState } from './types'

/** 記憶體版的本機，一個物件代表一台裝置 */
class Device implements LocalStore {
  data: Record<string, Note> = {}
  files = new Map<string, Attachment>()
  state: SyncState = { notes: {}, attachments: {} }
  saves = 0

  notes() {
    return this.data
  }
  /** 模擬 IndexedDB 寫入失敗：畫面上的資料已經換了，但 promise 失敗 */
  failWrites = false

  // 跟真的 store 一樣：資料當下就換好，promise 代表寫進 IndexedDB
  async upsert(notes: Note[]) {
    this.data = { ...this.data, ...Object.fromEntries(notes.map((n) => [n.id, n])) }
    if (this.failWrites) throw new Error('disk full')
  }
  async remove(ids: string[]) {
    this.data = { ...this.data }
    for (const id of ids) delete this.data[id]
    if (this.failWrites) throw new Error('disk full')
  }
  async allAttachments() {
    return [...this.files.values()]
  }
  async getAttachment(id: string) {
    return this.files.get(id)
  }
  async putAttachment(attachment: Attachment) {
    this.files.set(attachment.id, attachment)
  }
  async loadState() {
    return JSON.parse(JSON.stringify(this.state)) as SyncState
  }
  async saveState(state: SyncState) {
    this.saves++
    this.state = JSON.parse(JSON.stringify(state)) as SyncState
  }

  add(id: string, fields: Partial<Note> = {}): Note {
    const note: Note = {
      id,
      title: id,
      body: '',
      parent: null,
      order: 0,
      tags: [],
      props: {},
      created: stamp(),
      updated: stamp(),
      ...fields,
    }
    this.data = { ...this.data, [id]: note }
    return note
  }
  /** 使用者在這台裝置上改筆記：updated 一定往後 */
  edit(id: string, patch: Partial<Note>) {
    this.data = { ...this.data, [id]: { ...this.data[id], ...patch, updated: stamp() } }
  }
  /** 使用者在這台裝置上刪筆記 */
  del(id: string) {
    this.data = { ...this.data }
    delete this.data[id]
  }
  bodies() {
    return Object.values(this.data)
      .map((n) => n.body)
      .sort()
  }
  titles() {
    return Object.values(this.data)
      .map((n) => n.title)
      .sort()
  }
}

let clock = Date.parse('2026-02-01T00:00:00.000Z')
function stamp() {
  clock += 1000
  return new Date(clock).toISOString()
}

/** 另一台裝置直接改雲端上的某則筆記 */
function editRemote(drive: FakeDrive, id: string, patch: Partial<Note>) {
  const file = drive.findNote(id)!
  return drive.textOf(file.id).then((text) => {
    const note = fromMarkdown(text)!
    drive.editExternal(file.id, toMarkdown({ ...note, ...patch, updated: stamp() }))
  })
}

async function remoteNote(drive: FakeDrive, id: string): Promise<Note> {
  return fromMarkdown(await drive.textOf(drive.findNote(id)!.id))!
}

let drive: FakeDrive
let a: Device
let b: Device

beforeEach(() => {
  drive = new FakeDrive()
  a = new Device()
  b = new Device()
})

describe('syncOnce', () => {
  it('第一次同步把本機筆記全部上傳，記下資料夾與每則的紀錄', async () => {
    a.add('n1', { title: '書單' })
    a.add('n2', { title: '日記', parent: 'n1' })

    const result = await syncOnce(drive, a)

    expect(result).toMatchObject({ uploaded: 2, downloaded: 0, conflicts: 0, warnings: [] })
    const files = drive.filesOfKind('note')
    expect(files.map((f) => f.name).sort()).toEqual(['日記.md', '書單.md'])
    expect(a.state.rootId).toBeTruthy()
    expect(a.state.attachmentsId).toBeTruthy()
    expect(Object.keys(a.state.notes).sort()).toEqual(['n1', 'n2'])
    expect(a.state.lastSync).toBeTruthy()
    expect((await remoteNote(drive, 'n2')).parent).toBe('n1')

    // 沒有變動就什麼都不做
    const again = await syncOnce(drive, a)
    expect(again).toMatchObject({ uploaded: 0, downloaded: 0 })
    expect(drive.calls.download).toBe(0)
  })

  it('第二台裝置下載全部，內容與 id 不變', async () => {
    const original = a.add('n1', { title: '書單', body: '# 內容', tags: ['讀書'] })
    a.add('n2', { title: '日記' })
    await syncOnce(drive, a)

    const result = await syncOnce(drive, b)

    expect(result).toMatchObject({ uploaded: 0, downloaded: 2 })
    expect(b.data.n1).toEqual(original)
    // 下載後立刻再同步，不會被當成本機改過又傳回去
    expect(await syncOnce(drive, b)).toMatchObject({ uploaded: 0, downloaded: 0 })
  })

  it('兩台各改不同筆，互相同步後兩邊一樣', async () => {
    a.add('n1')
    a.add('n2')
    await syncOnce(drive, a)
    await syncOnce(drive, b)

    a.edit('n1', { body: 'A 改的' })
    b.edit('n2', { body: 'B 改的' })
    expect(await syncOnce(drive, a)).toMatchObject({ uploaded: 1, downloaded: 0 })
    expect(await syncOnce(drive, b)).toMatchObject({ uploaded: 1, downloaded: 1 })
    expect(await syncOnce(drive, a)).toMatchObject({ uploaded: 0, downloaded: 1 })

    expect(a.data.n1.body).toBe('A 改的')
    expect(a.data.n2.body).toBe('B 改的')
    expect(b.data).toEqual(a.data)
  })

  it('同一筆兩邊都改：較新的當正本，另一份存成衝突副本，兩份都上雲端', async () => {
    a.add('n1', { title: '日記', parent: null })
    await syncOnce(drive, a)
    await syncOnce(drive, b)

    b.edit('n1', { body: 'B 先改' })
    await syncOnce(drive, b)
    a.edit('n1', { body: 'A 後改' }) // updated 比 B 新

    const result = await syncOnce(drive, a, new Date(2026, 9, 21, 9, 30))

    expect(result).toMatchObject({ conflicts: 1, uploaded: 2 })
    expect(a.data.n1.body).toBe('A 後改')
    const copy = Object.values(a.data).find((n) => n.id !== 'n1')!
    expect(copy.title).toBe('日記（衝突副本 2026-10-21 09:30）')
    expect(copy.body).toBe('B 先改')
    expect((await remoteNote(drive, 'n1')).body).toBe('A 後改')
    expect((await remoteNote(drive, copy.id)).body).toBe('B 先改')

    // B 再同步就拿到正本與副本
    await syncOnce(drive, b)
    expect(b.data).toEqual(a.data)
  })

  it('本機那份比較舊時以雲端為正本，本機的另存副本', async () => {
    a.add('n1', { title: '日記' })
    await syncOnce(drive, a)
    a.edit('n1', { body: 'A 先改' })
    await editRemote(drive, 'n1', { body: '雲端後改' })

    expect(await syncOnce(drive, a)).toMatchObject({ conflicts: 1, downloaded: 1, uploaded: 1 })
    expect(a.data.n1.body).toBe('雲端後改')
    const copy = Object.values(a.data).find((n) => n.id !== 'n1')!
    expect(copy.body).toBe('A 先改')
    expect(drive.findNote(copy.id)).toBeTruthy()
  })

  it('兩邊改成一樣的內容不算衝突', async () => {
    a.add('n1')
    await syncOnce(drive, a)
    a.edit('n1', { body: '一樣' })
    await editRemote(drive, 'n1', { body: '一樣' })

    expect(await syncOnce(drive, a)).toMatchObject({ conflicts: 0, uploaded: 0, downloaded: 0 })
    expect(Object.keys(a.data)).toEqual(['n1'])
    expect(await syncOnce(drive, a)).toMatchObject({ conflicts: 0, uploaded: 0, downloaded: 0 })
  })

  it('本機刪除、雲端沒改：雲端檔丟垃圾桶', async () => {
    a.add('n1')
    a.add('n2')
    await syncOnce(drive, a)
    a.del('n1')

    expect(await syncOnce(drive, a)).toMatchObject({ deletedRemote: 1 })
    expect(drive.findNote('n1')).toBeUndefined()
    expect(a.state.notes.n1).toBeUndefined()
    // 另一台也跟著刪
    await syncOnce(drive, b)
    expect(Object.keys(b.data)).toEqual(['n2'])
  })

  it('本機刪除、雲端改過：把雲端版本救回本機', async () => {
    a.add('n1')
    await syncOnce(drive, a)
    a.del('n1')
    await editRemote(drive, 'n1', { body: '別台改的' })

    expect(await syncOnce(drive, a)).toMatchObject({ deletedRemote: 0, downloaded: 1 })
    expect(a.data.n1.body).toBe('別台改的')
    expect(drive.findNote('n1')).toBeTruthy()
  })

  it('雲端刪除、本機沒改：只刪本機那一則', async () => {
    a.add('n1')
    a.add('child', { parent: 'n1' })
    await syncOnce(drive, a)
    drive.trashExternal(drive.findNote('n1')!.id)

    expect(await syncOnce(drive, a)).toMatchObject({ deletedLocal: 1 })
    expect(Object.keys(a.data)).toEqual(['child'])
    expect(a.state.notes.n1).toBeUndefined()
  })

  it('雲端刪除、本機改過：重新上傳', async () => {
    a.add('n1')
    await syncOnce(drive, a)
    drive.trashExternal(drive.findNote('n1')!.id)
    a.edit('n1', { body: '還要留著' })

    expect(await syncOnce(drive, a)).toMatchObject({ deletedLocal: 0, uploaded: 1 })
    expect((await remoteNote(drive, 'n1')).body).toBe('還要留著')
  })

  it('改標題會一起改檔名，沒改標題不動檔名', async () => {
    a.add('n1', { title: '舊標題' })
    await syncOnce(drive, a)
    a.edit('n1', { title: '新/標題' })
    await syncOnce(drive, a)
    expect(drive.findNote('n1')!.name).toBe('新標題.md')
    expect(drive.filesOfKind('note')).toHaveLength(1)
  })

  it('附件：有筆記在用的才上傳，另一台下載回來', async () => {
    const blob = new Blob(['jpeg bytes'], { type: 'image/jpeg' })
    a.files.set('img1', { id: 'img1', type: 'image/jpeg', blob })
    a.files.set('unused', { id: 'unused', type: 'image/png', blob: new Blob(['x'], { type: 'image/png' }) })
    a.add('n1', { body: '![](_attachments/img1.jpg)' })

    expect(await syncOnce(drive, a)).toMatchObject({ attachmentsUploaded: 1 })
    const remote = drive.filesOfKind('attachment')
    expect(remote.map((f) => [f.name, f.appProperties?.weaveId])).toEqual([['img1.jpg', 'img1']])
    expect(a.state.attachments).toEqual({ img1: remote[0].id })

    expect(await syncOnce(drive, b)).toMatchObject({ downloaded: 1, attachmentsDownloaded: 1 })
    const got = b.files.get('img1')!
    expect(got.type).toBe('image/jpeg')
    expect(await got.blob.text()).toBe('jpeg bytes')

    // 已經傳過的不會再傳
    expect(await syncOnce(drive, a)).toMatchObject({ attachmentsUploaded: 0, attachmentsDownloaded: 0 })
    expect(await syncOnce(drive, b)).toMatchObject({ attachmentsUploaded: 0, attachmentsDownloaded: 0 })
  })

  it('下載附件不相信雲端的 type：只認點陣圖副檔名，SVG 和 HTML 存成 octet-stream', async () => {
    a.add('n1', { body: '![](_attachments/evil.svg)\n![](_attachments/page.bin)\n![](_attachments/pic.png)' })
    await syncOnce(drive, a)
    const folder = a.state.attachmentsId!
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'
    await drive.create(folder, 'evil.svg', new Blob([svg], { type: 'image/svg+xml' }), { weaveKind: 'attachment', weaveId: 'evil' })
    await drive.create(folder, 'page.bin', new Blob(['<script>x</script>'], { type: 'text/html' }), { weaveKind: 'attachment', weaveId: 'page' })
    await drive.create(folder, 'pic.png', new Blob(['png bytes'], { type: 'text/html' }), { weaveKind: 'attachment', weaveId: 'pic' })

    expect(await syncOnce(drive, b)).toMatchObject({ attachmentsDownloaded: 3 })
    for (const id of ['evil', 'page']) {
      expect(b.files.get(id)!.type).toBe('application/octet-stream')
      expect(b.files.get(id)!.blob.type).toBe('application/octet-stream')
    }
    expect(b.files.get('pic')!.type).toBe('image/png')
    expect(b.files.get('pic')!.blob.type).toBe('image/png')
    expect(await b.files.get('pic')!.blob.text()).toBe('png bytes')
  })

  it('壞檔略過並記在 warnings，其他照常同步', async () => {
    a.add('n1')
    await syncOnce(drive, a)
    const good = drive.putExternal(a.state.rootId!, 'good.md', toMarkdown({ ...a.data.n1, id: 'n2', title: '好的' }), {
      weaveKind: 'note',
      weaveId: 'n2',
    })
    const bad = drive.putExternal(a.state.rootId!, 'bad.md', '---\ntitle: [壞掉\n---\n內文', { weaveKind: 'note', weaveId: 'n3' })
    const plain = drive.putExternal(a.state.rootId!, '自己丟的.md', '# hi')

    const result = await syncOnce(drive, a)

    expect(result.downloaded).toBe(1)
    expect(a.data.n2.title).toBe('好的')
    expect(a.data.n3).toBeUndefined()
    expect(result.warnings).toEqual([
      { fileId: plain.id, name: '自己丟的.md', reason: 'untracked' },
      { fileId: bad.id, name: 'bad.md', reason: 'unreadable' },
    ])
    expect(a.state.notes.n2.fileId).toBe(good.id)
  })

  it('上傳到一半斷線，重跑後不會重複建立', async () => {
    for (let i = 0; i < 25; i++) a.add(`n${i}`)
    drive.failOn('create', new Error('network'), { nth: 15 })
    await expect(syncOnce(drive, a)).rejects.toThrow('network')
    // 第一批 10 則加上第二批其他 9 則都已經記下來，第三批還沒開始
    expect(Object.keys(a.state.notes)).toHaveLength(19)

    expect(await syncOnce(drive, a)).toMatchObject({ uploaded: 6 })
    expect(drive.filesOfKind('note')).toHaveLength(25)
  })

  it('雲端已經建好但回應沒收到，重跑認得回來，不會重複建立', async () => {
    a.add('n1')
    a.add('n2')
    drive.failOn('create', new Error('timeout'), { afterWork: true })
    await expect(syncOnce(drive, a)).rejects.toThrow('timeout')
    expect(drive.filesOfKind('note')).toHaveLength(2)

    expect(await syncOnce(drive, a)).toMatchObject({ uploaded: 0, conflicts: 0 })
    expect(drive.filesOfKind('note')).toHaveLength(2)
    expect(Object.keys(a.state.notes).sort()).toEqual(['n1', 'n2'])
  })

  it('同時呼叫兩次只跑一次', async () => {
    a.add('n1')
    const first = syncOnce(drive, a)
    const second = syncOnce(drive, a)
    expect(second).toBe(first)
    await Promise.all([first, second])
    expect(drive.calls.ensureFolders).toBe(1)
    expect(drive.filesOfKind('note')).toHaveLength(1)

    // 跑完之後可以再跑
    await syncOnce(drive, a)
    expect(drive.calls.ensureFolders).toBe(2)
  })

  it('授權過期與未登入原樣往外丟，之後可以重跑', async () => {
    a.add('n1')
    drive.failOn('listFiles', new TokenExpiredError())
    await expect(syncOnce(drive, a)).rejects.toBeInstanceOf(TokenExpiredError)

    drive.failOn('create', new TokenExpiredError())
    await expect(syncOnce(drive, a)).rejects.toBeInstanceOf(TokenExpiredError)

    drive.failOn('ensureFolders', new NotSignedInError())
    await expect(syncOnce(drive, a)).rejects.toBeInstanceOf(NotSignedInError)

    expect(await syncOnce(drive, a)).toMatchObject({ uploaded: 1 })
  })

  it('只下載有變動的檔案', async () => {
    for (let i = 0; i < 5; i++) a.add(`n${i}`)
    await syncOnce(drive, a)
    await syncOnce(drive, b)
    const before = drive.calls.download
    await editRemote(drive, 'n3', { body: '改' })

    await syncOnce(drive, b)
    expect(drive.calls.download - before).toBe(1)
    expect(drive.calls.listFiles).toBeGreaterThan(0)
  })

  it('同步途中使用者又改了同一筆：先不覆蓋，下次再處理', async () => {
    a.add('n1')
    await syncOnce(drive, a)
    await editRemote(drive, 'n1', { body: '雲端版' })

    // 下載回來之前使用者剛好改了
    const realDownload = drive.download.bind(drive)
    drive.download = async (id) => {
      const blob = await realDownload(id)
      a.edit('n1', { body: '剛打的字' })
      return blob
    }
    await syncOnce(drive, a)
    expect(a.data.n1.body).toBe('剛打的字')
    drive.download = realDownload

    // 下次同步就是兩邊都改過 → 衝突副本，兩份都在
    expect(await syncOnce(drive, a)).toMatchObject({ conflicts: 1 })
    expect(Object.values(a.data).map((n) => n.body).sort()).toEqual(['剛打的字', '雲端版'])
  })

  it('雲端資料夾被整個刪掉重建時，不會把本機刪光，而是重新上傳', async () => {
    a.add('n1')
    await syncOnce(drive, a)
    for (const f of drive.files.values()) f.trashed = true

    expect(await syncOnce(drive, a)).toMatchObject({ deletedLocal: 0, uploaded: 1 })
    expect(Object.keys(a.data)).toEqual(['n1'])
  })

  it('每一批存一次紀錄', async () => {
    for (let i = 0; i < 25; i++) a.add(`n${i}`)
    await syncOnce(drive, a)
    // 3 批筆記 + 最後一次
    expect(a.saves).toBe(4)
  })

  it('雲端已有同 id 的檔、內容一樣（重新連線）：直接接上，不另存副本', async () => {
    a.add('n1', { body: '一樣' })
    await syncOnce(drive, a)
    a.state = { notes: {}, attachments: {} }

    expect(await syncOnce(drive, a)).toMatchObject({ conflicts: 0, uploaded: 0, downloaded: 0 })
    expect(Object.keys(a.data)).toEqual(['n1'])
    expect(drive.filesOfKind('note')).toHaveLength(1)
  })
})

describe('同步途中使用者在改', () => {
  it('同一批裡先下載好的筆記，在批次結束前被改了：不覆蓋，下次兩份都留', async () => {
    a.add('n1')
    a.add('n2')
    await syncOnce(drive, a)
    await syncOnce(drive, b)
    await editRemote(drive, 'n1', { body: '雲端 n1' })
    await editRemote(drive, 'n2', { body: '雲端 n2' })

    const realDownload = drive.download.bind(drive)
    const slow = drive.findNote('n2')!.id
    drive.download = async (fileId) => {
      // n2 比較慢：n1 已經下載、檢查過了，這時使用者改了 n1
      if (fileId === slow) {
        await new Promise((r) => setTimeout(r, 20))
        b.edit('n1', { body: '剛打的字' })
      }
      return realDownload(fileId)
    }
    expect(await syncOnce(drive, b)).toMatchObject({ downloaded: 1 })
    drive.download = realDownload
    expect(b.data.n1.body).toBe('剛打的字')
    expect(b.data.n2.body).toBe('雲端 n2')
    // n1 沒寫回本機，紀錄也不能記成雲端那一版，不然改的字永遠傳不上去
    expect(b.state.notes.n1.localUpdated).not.toBe(b.data.n1.updated)

    expect(await syncOnce(drive, b)).toMatchObject({ conflicts: 1 })
    expect(b.bodies()).toEqual(['剛打的字', '雲端 n1', '雲端 n2'])
    expect((await remoteNote(drive, 'n1')).body).toBe('剛打的字')
  })

  it('以雲端為正本、正在上傳衝突副本時使用者又改了：不覆蓋，三個版本都留', async () => {
    a.add('n1')
    await syncOnce(drive, a)
    a.edit('n1', { body: '本機舊改' })
    await editRemote(drive, 'n1', { body: '雲端新改' })

    const realCreate = drive.create.bind(drive)
    drive.create = async (...args) => {
      const file = await realCreate(...args)
      a.edit('n1', { body: '剛打的字' })
      return file
    }
    await syncOnce(drive, a)
    drive.create = realCreate
    expect(a.data.n1.body).toBe('剛打的字')

    await syncOnce(drive, a)
    expect(a.bodies()).toEqual(['剛打的字', '本機舊改', '雲端新改'])
    expect((await remoteNote(drive, 'n1')).body).toBe('剛打的字')
  })

  it('雲端刪了、同一批還沒結束時使用者改了：不刪本機，下次重新上傳', async () => {
    a.add('n1')
    a.add('n2')
    await syncOnce(drive, a)
    drive.trashExternal(drive.findNote('n1')!.id)
    await editRemote(drive, 'n2', { body: '雲端 n2' })

    const realDownload = drive.download.bind(drive)
    drive.download = async (fileId) => {
      await new Promise((r) => setTimeout(r, 20))
      a.edit('n1', { body: '還要留著' })
      return realDownload(fileId)
    }
    expect(await syncOnce(drive, a)).toMatchObject({ deletedLocal: 0 })
    drive.download = realDownload
    expect(a.data.n1.body).toBe('還要留著')
    expect(a.state.notes.n1).toBeDefined()

    expect(await syncOnce(drive, a)).toMatchObject({ uploaded: 1 })
    expect((await remoteNote(drive, 'n1')).body).toBe('還要留著')
  })
})

describe('重新連線（沒有同步紀錄）', () => {
  it('兩邊內容不同：較新的當正本，較舊的另存衝突副本，不會默默丟掉', async () => {
    a.add('n1', { body: 'v0' })
    await syncOnce(drive, a)
    await syncOnce(drive, b)
    // a 中斷連線（清掉紀錄）後離線改，b 之後也改
    a.state = { notes: {}, attachments: {} }
    a.edit('n1', { body: 'A 離線改' })
    b.edit('n1', { body: 'B 後改' })
    await syncOnce(drive, b)

    expect(await syncOnce(drive, a)).toMatchObject({ conflicts: 1 })
    expect(a.data.n1.body).toBe('B 後改')
    expect(a.bodies()).toEqual(['A 離線改', 'B 後改'])
    const copy = Object.values(a.data).find((n) => n.id !== 'n1')!
    expect(copy.title).toContain('衝突副本')
    expect((await remoteNote(drive, copy.id)).body).toBe('A 離線改')
  })
})

describe('寫入本機失敗', () => {
  it('下載寫不進 IndexedDB：同步失敗，不記成已同步', async () => {
    a.add('n1')
    await syncOnce(drive, a)
    b.failWrites = true

    await expect(syncOnce(drive, b)).rejects.toThrow('disk full')
    expect(b.state.notes.n1).toBeUndefined()
  })

  it('刪除寫不進 IndexedDB：同步失敗，紀錄留著，不會被當成本機刪掉', async () => {
    a.add('n1')
    a.add('n2')
    await syncOnce(drive, a)
    drive.trashExternal(drive.findNote('n1')!.id)
    a.failWrites = true

    await expect(syncOnce(drive, a)).rejects.toThrow('disk full')
    expect(a.state.notes.n1).toBeDefined()
  })
})

describe('同一個 weaveId 有好幾個雲端檔', () => {
  function duplicate(id: string, patch: Partial<Note> = {}) {
    const note = { ...a.data[id], ...patch }
    return drive.putExternal(a.state.rootId!, `${id}.md`, toMarkdown(note), { weaveKind: 'note', weaveId: id })
  }

  it('內容一樣的重複檔丟掉；之後刪除筆記不會被重複檔救回來', async () => {
    a.add('n1', { body: 'v1' })
    await syncOnce(drive, a)
    const extra = duplicate('n1')

    expect(await syncOnce(drive, a)).toMatchObject({ conflicts: 0, downloaded: 0 })
    expect(drive.filesOfKind('note').map((f) => f.id)).not.toContain(extra.id)

    a.del('n1')
    await syncOnce(drive, a)
    await syncOnce(drive, a)
    expect(a.data.n1).toBeUndefined()
    expect(drive.filesOfKind('note')).toHaveLength(0)
  })

  it('刪除筆記時重複檔一起丟，就算它比較新', async () => {
    a.add('n1', { body: 'v1' })
    await syncOnce(drive, a)
    duplicate('n1', { body: '舊版', updated: stamp() })
    a.del('n1')

    expect(await syncOnce(drive, a)).toMatchObject({ deletedRemote: 1, downloaded: 0 })
    expect(drive.filesOfKind('note')).toHaveLength(0)
    await syncOnce(drive, a)
    expect(a.data.n1).toBeUndefined()
  })

  it('刪除時丟到一半斷線：下次接著丟，筆記不會被救回來', async () => {
    a.add('n1', { body: 'v1' })
    await syncOnce(drive, a)
    duplicate('n1')
    a.del('n1')
    // 重複檔丟掉了，正本那次斷線
    drive.failOn('trash', new Error('network'), { nth: 2 })

    await expect(syncOnce(drive, a)).rejects.toThrow('network')
    expect(a.state.notes.n1).toBeDefined()
    await syncOnce(drive, a)
    await syncOnce(drive, a)
    expect(a.data.n1).toBeUndefined()
    expect(drive.filesOfKind('note')).toHaveLength(0)
  })

  it('內容不同的重複檔：不蓋掉本機與正本，另存衝突副本再丟掉', async () => {
    a.add('n1', { body: 'v1' })
    await syncOnce(drive, a)
    const extra = duplicate('n1', { body: '別台的版本', updated: stamp() })
    a.edit('n1', { body: '本機較新' })

    expect(await syncOnce(drive, a)).toMatchObject({ conflicts: 1 })
    expect(a.data.n1.body).toBe('本機較新')
    expect(a.bodies()).toEqual(['別台的版本', '本機較新'])
    expect((await remoteNote(drive, 'n1')).body).toBe('本機較新')
    expect(drive.filesOfKind('note').map((f) => f.id)).not.toContain(extra.id)

    // 之後不會再出現副本，也不會被重複檔蓋回去
    expect(await syncOnce(drive, a)).toMatchObject({ conflicts: 0, downloaded: 0, uploaded: 0 })
    expect(a.data.n1.body).toBe('本機較新')
  })
})
