import { inAndroidShell } from '@/lib/nativeBridge'
import { androidGetToken, androidSignOut } from './authAndroid'
import { webGetToken, webPrepare, webSignInAvailable, webSignOut } from './authWeb'
import { SignInError } from './config'
import { NotSignedInError, type TokenProvider } from './types'

export { SignInError, type SignInErrorCode } from './config'

/**
 * Google 帳號授權（只拿雲端硬碟 drive.file 權限的 access token）。
 * Android 殼有原生 bridge 就走原生（authAndroid.ts），否則走網頁的 GIS（authWeb.ts）。
 * Android 殼沒有 bridge（WebView 太舊）時不能退回 GIS：Google 會用 disallowed_useragent 擋掉，
 * 這時當作不能連線。
 *
 * 這裡只多記一件事：「使用者曾經連線過」。存在 localStorage，只存布林、不存 token，
 * 讓畫面在重新整理後（網頁的 token 已經不在記憶體）顯示「按一下重新連線」。
 */

export interface AuthState {
  /** 目前手上有可用的 token（最近一次拿 token 成功） */
  signedIn: boolean
  /** 曾經連線過、而且沒有中斷連線 */
  wasConnected: boolean
}

const CONNECTED_KEY = 'weave-google-connected'

let state: AuthState = { signedIn: false, wasConnected: readConnected() }
const listeners = new Set<(state: AuthState) => void>()

function readConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

function writeConnected(connected: boolean) {
  try {
    if (connected) localStorage.setItem(CONNECTED_KEY, '1')
    else localStorage.removeItem(CONNECTED_KEY)
  } catch {
    // 無痕模式等情況存不了，只影響重新整理後的提示
  }
}

function setState(next: AuthState) {
  if (next.signedIn === state.signedIn && next.wasConnected === state.wasConnected) return
  if (next.wasConnected !== state.wasConnected) writeConnected(next.wasConnected)
  state = next
  for (const listener of listeners) listener(state)
}

/** 網頁版沒設定用戶端 ID、或 Android 殼沒有授權 bridge 時是 false，畫面應該藏起同步功能 */
export function isSignInAvailable(): boolean {
  if (window.RoutinaWeaveAuth) return true
  return !inAndroidShell() && webSignInAvailable()
}

export function getAuthState(): AuthState {
  return state
}

/** 登入狀態變化時通知，回傳取消訂閱的函式 */
export function onAuthChange(listener: (state: AuthState) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 網頁版：先下載 Google 的登入腳本，之後按「連線」才能立刻開視窗。
 * 畫面出現連線按鈕時呼叫；Android 不需要。
 */
export function prepareSignIn(): void {
  if (!window.RoutinaWeaveAuth && !inAndroidShell()) webPrepare()
}

export const getAccessToken: TokenProvider = async ({ interactive, forceRefresh = false }) => {
  const bridge = window.RoutinaWeaveAuth
  try {
    if (!bridge && inAndroidShell()) throw new SignInError('unavailable')
    const token = bridge
      ? await androidGetToken(bridge, interactive, forceRefresh)
      : await webGetToken(interactive, forceRefresh)
    setState({ signedIn: true, wasConnected: true })
    return token
  } catch (error) {
    if (error instanceof NotSignedInError) setState({ ...state, signedIn: false })
    throw error
  }
}

/** 互動式連線：網頁版必須在按鈕的 onClick 裡呼叫，不然彈出視窗會被瀏覽器擋 */
export async function signIn(): Promise<void> {
  await getAccessToken({ interactive: true })
}

/** 中斷連線並撤銷授權。撤銷失敗也會清掉本機狀態，再把錯誤丟出去 */
export async function signOut(): Promise<void> {
  const bridge = window.RoutinaWeaveAuth
  try {
    if (bridge) await androidSignOut(bridge)
    else if (!inAndroidShell()) await webSignOut()
  } finally {
    setState({ signedIn: false, wasConnected: false })
  }
}
