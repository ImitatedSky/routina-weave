import { create } from 'zustand'
import { useNotes } from '@/store/notes'
import { getMeta } from '@/storage/db'
import { createDriveApi } from './drive'
import { syncOnce, type SyncReport } from './engine'
import { getAccessToken, getAuthState, isSignInAvailable, onAuthChange, signIn, signOut, SignInError } from './auth'
import { clearSyncState, localStore } from './localStore'
import { NotSignedInError, TokenExpiredError } from './types'

/**
 * 雲端同步的對外入口：狀態給畫面看，什麼時候同步也在這裡決定。
 *   - 連線後立刻同步一次
 *   - 打字停下來 10 秒後同步（筆記有變動才會排）
 *   - App 在前景時每 3 分鐘同步一次，回到前景或恢復網路時也同步
 */
export type SyncStatus =
  /** 這個版本沒有設定 Google 用戶端，畫面不顯示同步功能 */
  | 'unavailable'
  | 'disconnected'
  /** 曾經連線，但需要使用者再按一次（網頁版重新整理後 token 不在了） */
  | 'reconnect'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error'
  /** 連上的 Google 帳號跟第一次同步的不一樣，暫停同步 */
  | 'account-mismatch'

interface SyncUiState {
  status: SyncStatus
  lastSync?: string
  lastReport?: SyncReport
  error?: string
  email?: string
}

export const useSync = create<SyncUiState>(() => ({
  status: isSignInAvailable() ? (getAuthState().wasConnected ? 'reconnect' : 'disconnected') : 'unavailable',
}))

const drive = createDriveApi(getAccessToken)

const CHANGE_DELAY = 10_000
const INTERVAL = 3 * 60_000

let changeTimer: number | undefined

function set(patch: Partial<SyncUiState>) {
  useSync.setState(patch)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : '同步失敗'
}

/**
 * 第二台裝置第一次同步：雲端已經有筆記的話，先拿掉本機「從沒動過的示範筆記」，
 * 不然每台裝置各自的示範筆記會全部疊在一起。
 * 只在完全沒同步過時做（同步到一半失敗過的話，示範筆記可能是自己剛傳上去的），
 * 底下有使用者自己子頁面的示範筆記也留著，不然子頁面會沒有上層。
 */
async function dropUntouchedSeeds() {
  const state = await localStore.loadState()
  if (state.lastSync || Object.keys(state.notes).length > 0) return
  const seedIds = (await getMeta<string[]>('seed-ids')) ?? []
  if (!seedIds.length) return
  const { rootId } = await drive.ensureFolders()
  const remote = await drive.listFiles(rootId)
  if (!remote.some((f) => f.appProperties?.weaveKind === 'note')) return
  const notes = useNotes.getState().notes
  const seeds = new Set(seedIds)
  const hasOwnChild = (id: string) => Object.values(notes).some((n) => n.parent === id && !seeds.has(n.id))
  const untouched = seedIds.filter((id) => notes[id] && notes[id].updated === notes[id].created && !hasOwnChild(id))
  if (untouched.length) await useNotes.getState().removeNotes(untouched)
}

let running: Promise<void> | null = null
let again = false
/** 中斷連線途中不要再開始新的同步，不然會把剛清掉的同步紀錄寫回去 */
let disconnecting = false

/**
 * 同步一次。沒連線或 token 過期時不跳任何畫面，只更新狀態讓使用者自己按。
 * 同一時間只跑一次：跑到一半又被叫，就等這次跑完再補跑一次，免得兩次同步互相蓋掉同步紀錄。
 */
export function syncNow(): Promise<void> {
  const status = useSync.getState().status
  // 帳號不對時不要自己一直重試，等使用者中斷連線
  if (disconnecting || status === 'unavailable' || status === 'disconnected' || status === 'account-mismatch') return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await runOnce()
      } while (again && useSync.getState().status === 'idle')
    } finally {
      running = null
    }
  })()
  return running
}

async function runOnce() {
  set({ status: 'syncing', error: undefined })
  try {
    if (!(await checkAccount())) return
    await dropUntouchedSeeds()
    const report = await syncOnce(drive, localStore)
    const now = new Date().toISOString()
    const state = await localStore.loadState()
    await localStore.saveState({ ...state, lastSync: now })
    set({ status: 'idle', lastSync: now, lastReport: report })
  } catch (error) {
    if (error instanceof NotSignedInError || error instanceof TokenExpiredError) set({ status: 'reconnect' })
    else if (error instanceof Error && error.name === 'NetworkError') set({ status: 'offline' })
    else set({ status: 'error', error: describe(error) })
  }
}

/**
 * 確認連的是第一次同步的那個 Google 帳號。換了帳號還照常同步的話，
 * 本機筆記會整批傳到另一個人的雲端硬碟，所以直接暫停，讓使用者中斷連線後再決定。
 */
async function checkAccount(): Promise<boolean> {
  const user = await drive.getUser()
  set({ email: user.emailAddress })
  if (!user.permissionId) throw new Error('讀不到 Google 帳號資訊')
  const state = await localStore.loadState()
  if (!state.account) {
    await localStore.saveState({ ...state, account: user.permissionId, accountEmail: user.emailAddress })
    return true
  }
  if (state.account === user.permissionId) return true
  const before = state.accountEmail ?? '之前的帳號'
  set({
    status: 'account-mismatch',
    error: `現在連線的是 ${user.emailAddress ?? '另一個帳號'}，不是之前同步的 ${before}，已暫停同步。要換帳號請先中斷連線再重新連線。`,
  })
  return false
}

/** 按「連線 Google 雲端硬碟」：網頁版必須在 onClick 裡直接呼叫，登入視窗才不會被擋 */
export async function connect(): Promise<void> {
  try {
    await signIn()
  } catch (error) {
    const cancelled = error instanceof SignInError && error.code === 'cancelled'
    set({ status: getAuthState().wasConnected ? 'reconnect' : 'disconnected', error: cancelled ? undefined : describe(error) })
    return
  }
  set({ status: 'idle', error: undefined })
  await syncNow()
}

/** 中斷連線：撤銷授權、清掉同步紀錄。本機筆記和雲端檔案都留著 */
export async function disconnect(): Promise<void> {
  disconnecting = true
  try {
    // 等同步跑完再清，不然跑到一半的同步會把舊紀錄寫回去
    await running
    let error: string | undefined
    try {
      await signOut()
    } catch (e) {
      // 撤銷失敗（例如離線）本機一樣當作已中斷，提醒使用者可以到 Google 帳戶頁面手動移除
      error = `已中斷連線，但撤銷授權失敗：${describe(e)}`
    }
    await clearSyncState()
    set({ status: 'disconnected', error, lastSync: undefined, lastReport: undefined, email: undefined })
  } finally {
    disconnecting = false
  }
}

let started = false

/** App 載入筆記後呼叫一次 */
export function startAutoSync(): void {
  if (started || useSync.getState().status === 'unavailable') return
  started = true

  void localStore.loadState().then((state) => {
    if (state.lastSync) set({ lastSync: state.lastSync })
  })

  onAuthChange((auth) => {
    const status = useSync.getState().status
    if (!auth.wasConnected) set({ status: 'disconnected' })
    else if (auth.signedIn && (status === 'reconnect' || status === 'disconnected')) set({ status: 'idle' })
  })

  // 筆記有變動就排一次同步。同步途中使用者打的字也要排到；
  // 同步自己寫進來的變動會多排一次，但那次沒有東西要傳，很快就結束
  useNotes.subscribe((now, prev) => {
    if (now.notes === prev.notes) return
    window.clearTimeout(changeTimer)
    changeTimer = window.setTimeout(() => void syncNow(), CHANGE_DELAY)
  })

  window.setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, INTERVAL)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  window.addEventListener('online', () => void syncNow())

  // 曾經連線過：Android 可以不跳畫面直接拿 token；網頁版拿不到就停在「按一下重新連線」
  if (getAuthState().wasConnected) {
    set({ status: 'idle' })
    void syncNow()
  }
}
