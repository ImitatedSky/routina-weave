import { askBridge, type BridgePort } from '@/lib/nativeBridge'
import { SignInError, type SignInErrorCode } from './config'
import { NotSignedInError } from './types'

/**
 * Android 殼的 Google 授權。Google 不允許在 WebView 裡登入（disallowed_useragent），
 * 所以交給原生的 Google Identity Services（android/.../GoogleAuth.kt）。
 * access token 由 Play services 管理與快取，這裡不另外保存。
 *
 * 送給 `RoutinaWeaveAuth`：`{"method":"getToken","interactive":…,"forceRefresh":…}` 或 `{"method":"signOut"}`。
 * 回覆：成功 `{"ok":true,"token":…}`（signOut 沒有 token），失敗 `{"ok":false,"error":<代碼>}`，
 * 代碼見 GoogleAuth.kt，可能接「:細節」。
 */
interface BridgeResult {
  ok: boolean
  token?: string
  error?: string
}

declare global {
  interface Window {
    RoutinaWeaveAuth?: BridgePort
  }
}

// 使用者可能停在同意畫面好一陣子
const TIMEOUT_MS = 2 * 60 * 1000

async function ask(port: BridgePort, request: object): Promise<BridgeResult> {
  return (await askBridge<BridgeResult>(port, request, TIMEOUT_MS)) ?? { ok: false, error: 'timeout' }
}

const SIGN_IN_CODES: SignInErrorCode[] = ['cancelled', 'denied', 'unavailable', 'config', 'network']

/** 原生端的錯誤代碼換成例外。needs-interaction 是「還沒授權過，要使用者按連線」 */
export function bridgeError(error = 'failed'): NotSignedInError {
  const split = error.indexOf(':')
  const code = split < 0 ? error : error.slice(0, split)
  const detail = split < 0 ? undefined : error.slice(split + 1)
  if (code === 'needs-interaction') return new NotSignedInError()
  if (code === 'timeout') return new SignInError('failed', '等候逾時')
  if ((SIGN_IN_CODES as string[]).includes(code)) return new SignInError(code as SignInErrorCode, detail)
  return new SignInError('failed', error)
}

export async function androidGetToken(port: BridgePort, interactive: boolean, forceRefresh: boolean): Promise<string> {
  const result = await ask(port, { method: 'getToken', interactive, forceRefresh })
  if (result.ok && typeof result.token === 'string' && result.token) return result.token
  throw bridgeError(typeof result.error === 'string' ? result.error : undefined)
}

export async function androidSignOut(port: BridgePort): Promise<void> {
  const result = await ask(port, { method: 'signOut' })
  if (!result.ok) throw bridgeError(typeof result.error === 'string' ? result.error : undefined)
}
