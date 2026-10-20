import { DRIVE_SCOPE, GOOGLE_CLIENT_ID, SignInError } from './config'
import { NotSignedInError } from './types'

/**
 * 網頁版的 Google 授權：Google Identity Services 的 token model。
 *
 * - 腳本在第一次需要時才載入，不放進 index.html。
 * - access token 只放在記憶體（重新整理就沒了），不存 localStorage / sessionStorage。
 * - 瀏覽器只允許在使用者手勢裡開彈出視窗，所以非互動模式拿不到就直接丟 NotSignedInError。
 * - token model 沒有 refresh token，token 大約一小時到期，之後要使用者再按一次連線。
 */

const GIS_URL = 'https://accounts.google.com/gsi/client'
// 提前 5 分鐘當成過期，免得同步到一半失效
const EXPIRY_MARGIN_MS = 5 * 60 * 1000
const DEFAULT_LIFETIME_S = 3600

/** GIS 型別只寫用得到的部分 */
interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  scope?: string
  error?: string
  error_description?: string
}

interface TokenClientError {
  type: string
  message?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: TokenClientError) => void
  }): TokenClient
  hasGrantedAllScopes(response: TokenResponse, scope: string): boolean
  revoke(token: string, done?: (response?: { successful?: boolean; error?: string; error_description?: string }) => void): void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

interface Waiting {
  resolve: (token: string) => void
  reject: (error: Error) => void
}

let token: { value: string; expiresAt: number } | null = null
let client: TokenClient | null = null
let waiting: Waiting | null = null
let loading: Promise<GoogleOAuth2> | null = null

export function webSignInAvailable(): boolean {
  return GOOGLE_CLIENT_ID !== ''
}

/** 先把 GIS 腳本載好，按下連線時就不用等下載。失敗沒關係，按下去時會再試一次 */
export function webPrepare(): void {
  if (webSignInAvailable()) loadGis().catch(() => {})
}

export async function webGetToken(interactive: boolean, forceRefresh: boolean): Promise<string> {
  // Drive 回 401：這個 token 已經被拒絕，不能再用
  if (forceRefresh) token = null
  if (token && Date.now() < token.expiresAt - EXPIRY_MARGIN_MS) return token.value
  if (!interactive) throw new NotSignedInError()
  if (!webSignInAvailable()) throw new SignInError('unavailable')

  // 腳本通常已經預先載好；沒有的話等它下載，瀏覽器的使用者手勢有幾秒的效期，來得及開視窗
  const oauth2 = await loadGis()
  return requestToken(oauth2)
}

export async function webSignOut(): Promise<void> {
  const current = token
  token = null
  waiting?.reject(new SignInError('cancelled'))
  waiting = null
  const oauth2 = window.google?.accounts?.oauth2
  // 重新整理後記憶體沒有 token，就撤銷不了；使用者可以到 Google 帳戶的「第三方存取權」移除
  if (!current || !oauth2) return
  // 過期的 token 撤銷不了，直接告訴使用者，不要假裝成功
  if (Date.now() >= current.expiresAt) throw new SignInError('failed', '授權已過期，請到 Google 帳戶的第三方連結移除 Weave')
  await new Promise<void>((resolve, reject) =>
    oauth2.revoke(current.value, (response) => {
      if (response?.successful === false) reject(new SignInError('failed', response.error_description ?? response.error))
      else resolve()
    }),
  )
}

function loadGis(): Promise<GoogleOAuth2> {
  const ready = window.google?.accounts?.oauth2
  if (ready) return Promise.resolve(ready)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_URL
    script.async = true
    const fail = () => {
      loading = null
      script.remove()
      reject(new SignInError('unavailable', '載入不了 Google 登入元件'))
    }
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2
      if (oauth2) resolve(oauth2)
      else fail()
    }
    script.onerror = fail
    document.head.appendChild(script)
  })
  return loading
}

function requestToken(oauth2: GoogleOAuth2): Promise<string> {
  const tokenClient = (client ??= oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: (response) => onToken(oauth2, response),
    error_callback: onError,
  }))
  // 上一次的視窗還沒結果就又按了一次：舊的當成取消，結果交給新的
  waiting?.reject(new SignInError('cancelled'))
  return new Promise((resolve, reject) => {
    waiting = { resolve, reject }
    // prompt 空字串：同意過一次之後，重新連線不用再看一次同意畫面
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

function takeWaiting(): Waiting | null {
  const current = waiting
  waiting = null
  return current
}

function onToken(oauth2: GoogleOAuth2, response: TokenResponse) {
  const current = takeWaiting()
  if (!current) return
  if (response.error || !response.access_token) {
    const code = response.error === 'access_denied' ? 'denied' : 'failed'
    current.reject(new SignInError(code, response.error_description ?? response.error))
    return
  }
  // 同意畫面可以只勾部分權限，沒勾雲端硬碟就等於沒授權
  if (!oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
    current.reject(new SignInError('denied'))
    return
  }
  const lifetime = Number(response.expires_in) || DEFAULT_LIFETIME_S
  token = { value: response.access_token, expiresAt: Date.now() + lifetime * 1000 }
  current.resolve(response.access_token)
}

function onError(error: TokenClientError) {
  const current = takeWaiting()
  if (!current) return
  if (error.type === 'popup_closed') current.reject(new SignInError('cancelled'))
  else if (error.type === 'popup_failed_to_open') current.reject(new SignInError('popup-blocked'))
  else current.reject(new SignInError('failed', error.message ?? error.type))
}
