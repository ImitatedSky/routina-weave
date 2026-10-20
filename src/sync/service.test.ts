import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotes } from '@/store/notes'
import { setMeta } from '@/storage/db'
import type { Note } from '@/notes/types'
import { FakeDrive } from './fakeDrive'
import { NetworkError } from './drive'
import { TokenExpiredError } from './types'

// 授權和 Drive 都換成假的，只測 service 自己的狀態變化
const fake = vi.hoisted(() => ({
  drive: null as unknown as FakeDrive,
  signIn: vi.fn<() => Promise<void>>(),
  signOut: vi.fn<() => Promise<void>>(),
}))

vi.mock('./auth', async () => {
  const { SignInError } = await import('./config')
  return {
    SignInError,
    isSignInAvailable: () => true,
    getAuthState: () => ({ signedIn: false, wasConnected: false }),
    onAuthChange: () => () => {},
    getAccessToken: async () => 'token',
    signIn: fake.signIn,
    signOut: fake.signOut,
  }
})

vi.mock('./drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./drive')>()
  const { FakeDrive } = await import('./fakeDrive')
  fake.drive = new FakeDrive()
  return { ...actual, createDriveApi: () => fake.drive }
})

const { connect, disconnect, syncNow, useSync } = await import('./service')
const { SignInError } = await import('./config')
const { localStore } = await import('./localStore')

function note(id: string, fields: Partial<Note> = {}): Note {
  const time = '2026-01-01T00:00:00.000Z'
  return { id, title: id, body: '', parent: null, order: 0, tags: [], props: {}, created: time, updated: time, ...fields }
}

beforeEach(async () => {
  fake.drive.files.clear()
  fake.signIn.mockReset().mockResolvedValue(undefined)
  fake.signOut.mockReset().mockResolvedValue(undefined)
  useNotes.setState({ loaded: true, notes: {} })
  useSync.setState({ status: 'disconnected', error: undefined, email: undefined, lastSync: undefined, lastReport: undefined })
  await setMeta('seed-ids', [])
  await setMeta('drive-sync-state', { notes: {}, attachments: {} })
})

describe('sync service', () => {
  it('連線成功後同步一次並記下帳號', async () => {
    useNotes.getState().importNotes([note('a', { updated: '2026-02-01T00:00:00.000Z' })])
    await connect()
    expect(useSync.getState().status).toBe('idle')
    expect(useSync.getState().lastSync).toBeDefined()
    expect(fake.drive.findNote('a')).toBeDefined()
    await vi.waitFor(() => expect(useSync.getState().email).toBe('test@example.com'))
  })

  it('使用者自己關掉登入視窗：維持未連線，不顯示錯誤', async () => {
    fake.signIn.mockRejectedValue(new SignInError('cancelled'))
    await connect()
    expect(useSync.getState()).toMatchObject({ status: 'disconnected', error: undefined })
  })

  it('登入失敗要顯示原因', async () => {
    fake.signIn.mockRejectedValue(new SignInError('denied'))
    await connect()
    expect(useSync.getState().status).toBe('disconnected')
    expect(useSync.getState().error).toBeTruthy()
  })

  it('沒連線時 syncNow 什麼都不做', async () => {
    const before = fake.drive.calls.listFiles
    await syncNow()
    expect(fake.drive.calls.listFiles).toBe(before)
  })

  it('token 過期改成「需要重新連線」', async () => {
    useSync.setState({ status: 'idle' })
    fake.drive.failOn('ensureFolders', new TokenExpiredError())
    await syncNow()
    expect(useSync.getState().status).toBe('reconnect')
  })

  it('斷網改成離線，不算錯誤', async () => {
    useSync.setState({ status: 'idle' })
    fake.drive.failOn('ensureFolders', new NetworkError())
    await syncNow()
    expect(useSync.getState()).toMatchObject({ status: 'offline', error: undefined })
  })

  it('第二台裝置第一次同步：雲端已有筆記就拿掉沒動過的示範筆記', async () => {
    const { rootId } = await fake.drive.ensureFolders()
    fake.drive.putExternal(rootId, '別台.md', '# 別台', { weaveKind: 'note', weaveId: 'other' })
    useNotes.getState().importNotes([note('seed1'), note('seed2', { updated: '2026-03-01T00:00:00.000Z' })])
    await setMeta('seed-ids', ['seed1', 'seed2'])
    useSync.setState({ status: 'idle' })
    await syncNow()
    const notes = useNotes.getState().notes
    expect(notes.seed1).toBeUndefined()
    // 使用者改過的示範筆記要留著
    expect(notes.seed2).toBeDefined()
  })

  it('示範筆記底下有使用者自己的子頁面就留著', async () => {
    const { rootId } = await fake.drive.ensureFolders()
    fake.drive.putExternal(rootId, '別台.md', '# 別台', { weaveKind: 'note', weaveId: 'other' })
    useNotes.getState().importNotes([note('seed1'), note('mine', { parent: 'seed1', updated: '2026-03-01T00:00:00.000Z' })])
    await setMeta('seed-ids', ['seed1'])
    useSync.setState({ status: 'idle' })
    await syncNow()
    expect(useNotes.getState().notes.seed1).toBeDefined()
  })

  it('同步到一半失敗過（已有同步紀錄）就不再刪示範筆記', async () => {
    const { rootId } = await fake.drive.ensureFolders()
    fake.drive.putExternal(rootId, 'seed1.md', '# seed1', { weaveKind: 'note', weaveId: 'seed1' })
    useNotes.getState().importNotes([note('seed1')])
    await setMeta('seed-ids', ['seed1'])
    await setMeta('drive-sync-state', { notes: { seed1: { fileId: 'x', remoteModified: '', localUpdated: '' } }, attachments: {} })
    useSync.setState({ status: 'idle' })
    await syncNow()
    expect(useNotes.getState().notes.seed1).toBeDefined()
  })

  it('雲端沒有筆記時保留示範筆記', async () => {
    useNotes.getState().importNotes([note('seed1')])
    await setMeta('seed-ids', ['seed1'])
    useSync.setState({ status: 'idle' })
    await syncNow()
    expect(useNotes.getState().notes.seed1).toBeDefined()
  })

  it('中斷連線：清掉同步紀錄，本機筆記留著', async () => {
    useNotes.getState().importNotes([note('a')])
    await connect()
    await disconnect()
    expect(useSync.getState().status).toBe('disconnected')
    expect((await localStore.loadState()).notes).toEqual({})
    expect(useNotes.getState().notes.a).toBeDefined()
  })

  it('撤銷授權失敗也要中斷，並提醒使用者', async () => {
    fake.signOut.mockRejectedValue(new Error('offline'))
    await disconnect()
    expect(useSync.getState().status).toBe('disconnected')
    expect(useSync.getState().error).toContain('撤銷授權失敗')
  })
})

describe('帳號綁定', () => {
  it('第一次同步記下帳號，之後換帳號就暫停、不上傳', async () => {
    fake.drive.user = { emailAddress: 'a@example.com', permissionId: 'user-a' }
    await connect()
    expect((await localStore.loadState()).account).toBe('user-a')

    fake.drive.user = { emailAddress: 'b@example.com', permissionId: 'user-b' }
    useNotes.getState().importNotes([note('secret', { updated: '2026-05-01T00:00:00.000Z' })])
    await syncNow()
    expect(useSync.getState().status).toBe('account-mismatch')
    expect(useSync.getState().error).toContain('b@example.com')
    expect(fake.drive.findNote('secret')).toBeUndefined()

    // 暫停時自動同步不會再跑
    const before = fake.drive.calls.getUser
    await syncNow()
    expect(fake.drive.calls.getUser).toBe(before)

    // 中斷連線後可以改用新帳號
    await disconnect()
    await connect()
    expect(useSync.getState().status).toBe('idle')
    expect((await localStore.loadState()).account).toBe('user-b')
    fake.drive.user = { displayName: '測試', emailAddress: 'test@example.com', permissionId: 'user-1' }
  })

  it('同步途中又被叫：跑完再補一次，不會同時跑兩個', async () => {
    useSync.setState({ status: 'idle' })
    const first = syncNow()
    const second = syncNow()
    expect(second).toBe(first)
    await first
    expect(useSync.getState().status).toBe('idle')
  })

  it('中斷連線途中不會再開始同步，同步紀錄不會被寫回來', async () => {
    await connect()
    let finishSignOut = () => {}
    fake.signOut.mockImplementation(() => new Promise<void>((resolve) => (finishSignOut = resolve)))
    const disconnecting = disconnect()
    await vi.waitFor(() => expect(fake.signOut).toHaveBeenCalled())
    const before = fake.drive.calls.getUser
    await syncNow()
    expect(fake.drive.calls.getUser).toBe(before)
    finishSignOut()
    await disconnecting
    expect((await localStore.loadState()).account).toBeUndefined()
  })
})
