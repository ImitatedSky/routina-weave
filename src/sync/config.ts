import { NotSignedInError } from './types'

/**
 * Google 授權的共用設定。
 *
 * 網頁版的用戶端 ID 在建置時由 VITE_GOOGLE_CLIENT_ID 帶入（見 docs/google-setup.md）。
 * 用戶端 ID 不是秘密，會出現在打包後的 JS 裡。Android 版不需要：Google 用 package 名稱
 * 加簽章的 SHA-1 對應到 Cloud 專案裡的 Android 用戶端。
 */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

/** 只用這個權限：只看得到這個 App 自己建立或使用者用這個 App 開過的檔案 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/**
 * - cancelled：使用者關掉視窗或按了取消
 * - popup-blocked：瀏覽器擋了登入視窗
 * - denied：使用者拒絕，或沒有勾選雲端硬碟權限
 * - unavailable：沒有設定用戶端 ID、載入不了 Google 的腳本、手機沒有 Google Play 服務
 * - config：Google 那邊的設定不對（Android 的 package 或 SHA-1 對不上）
 * - network：連不上網路
 * - failed：其他錯誤
 */
export type SignInErrorCode =
  | 'cancelled'
  | 'popup-blocked'
  | 'denied'
  | 'unavailable'
  | 'config'
  | 'network'
  | 'failed'

const MESSAGES: Record<SignInErrorCode, string> = {
  cancelled: '已取消連線',
  'popup-blocked': '瀏覽器擋住了登入視窗，請允許彈出視窗後再試一次',
  denied: '需要允許存取 Google 雲端硬碟才能同步',
  unavailable: '這個版本無法連線 Google 帳號',
  config: 'Google 還沒登記這個 App（需要先在 Google Cloud 建立 OAuth 用戶端）',
  network: '連不上網路，請稍後再試',
  failed: '連線 Google 帳號失敗',
}

/** 互動式登入失敗。繼承 NotSignedInError：只想知道「有沒有登入」的呼叫端不用另外處理 */
export class SignInError extends NotSignedInError {
  readonly code: SignInErrorCode

  constructor(code: SignInErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]}（${detail}）` : MESSAGES[code])
    this.name = 'SignInError'
    this.code = code
  }
}
