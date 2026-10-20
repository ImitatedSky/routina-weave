import { askBridge, inAndroidShell, type BridgePort } from './nativeBridge'

/**
 * Android App 注入的存檔 bridge（android/.../FileSaver.kt）。網頁版沒有它，改用下載。
 * 送 `{"base64":…,"filename":…,"mimeType":…}`，回覆 `{"status":"saved"|"cancelled"|"error","message":…}`。
 */
interface BridgeResult {
  status?: string
  message?: string
}

declare global {
  interface Window {
    RoutinaWeaveFiles?: BridgePort
  }
}

export type SaveResult = 'saved' | 'cancelled'

// bridge 只傳代碼（decode / dialog / write），後面可能接「:例外訊息」
const ERROR_TEXT: Record<string, string> = {
  decode: '存檔失敗：檔案內容無法解碼',
  dialog: '存檔失敗：無法開啟「另存新檔」',
  write: '存檔失敗：無法寫入檔案',
}

function errorMessage(message: string): string {
  const colon = message.indexOf(':')
  const code = colon < 0 ? message : message.slice(0, colon)
  const detail = colon < 0 ? '' : message.slice(colon + 1).trim()
  const text = ERROR_TEXT[code] ?? '存檔失敗'
  return detail ? `${text}（${detail}）` : text
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    // data URL 的格式是 data:<mime>;base64,<內容>
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('讀取檔案失敗'))
    reader.readAsDataURL(blob)
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // 延後釋放，部分瀏覽器在 click 之後才開始讀
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** App 裡跳「另存新檔」；網頁版直接下載（瀏覽器不會告訴我們使用者有沒有取消，一律當成已存） */
export async function saveFile(blob: Blob, filename: string): Promise<SaveResult> {
  const bridge = window.RoutinaWeaveFiles
  if (!bridge) {
    // WebView 不處理 blob: 下載，點了不會有任何反應，不能假裝存好了
    if (inAndroidShell()) throw new Error('存檔失敗：請更新「Android System WebView」後再試')
    downloadBlob(blob, filename)
    return 'saved'
  }
  const base64 = await toBase64(blob)
  // 使用者可能停在「另存新檔」畫面很久，不設逾時
  const result = await askBridge<BridgeResult>(bridge, {
    base64,
    filename,
    mimeType: blob.type || 'application/octet-stream',
  })
  if (result?.status === 'saved' || result?.status === 'cancelled') return result.status
  throw new Error(errorMessage(typeof result?.message === 'string' ? result.message : ''))
}
