/**
 * Android 殼的原生 bridge 共用的收發。
 *
 * 原生端用 WebViewCompat.addWebMessageListener 注入物件（android/.../WebBridge.kt），
 * 只注入自己的 origin，回覆也只送回發出請求的那個 frame。
 * 送出 `{"id":…, …}` 的 JSON 字串，回覆是帶同一個 id 的 JSON 字串。
 */
export interface BridgePort {
  postMessage(message: string): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}

// Android 殼在 User-Agent 後面加的標記（MainActivity.kt）
const ANDROID_SHELL_MARKER = /\bRoutinaWeaveAndroid\b/

/** 在 Android 殼裡。bridge 可能因為 WebView 太舊而沒有注入，這時網頁版的替代做法多半也不能用 */
export function inAndroidShell(): boolean {
  return ANDROID_SHELL_MARKER.test(navigator.userAgent)
}

const pending = new Map<string, (reply: object) => void>()
const listening = new WeakSet<BridgePort>()

function onReply(event: MessageEvent) {
  if (typeof event.data !== 'string') return
  let reply: { id?: unknown }
  try {
    reply = JSON.parse(event.data) as { id?: unknown }
  } catch {
    return
  }
  if (typeof reply !== 'object' || reply === null || typeof reply.id !== 'string') return
  const resolve = pending.get(reply.id)
  if (!resolve) return
  pending.delete(reply.id)
  resolve(reply)
}

/** 不需要回覆的通知（例如系統列顏色） */
export function notifyBridge(port: BridgePort, message: object): void {
  port.postMessage(JSON.stringify(message))
}

/** 送出請求並等回覆。有給 timeoutMs 時，逾時回傳 null */
export function askBridge<T extends object>(port: BridgePort, request: object, timeoutMs?: number): Promise<T | null> {
  if (!listening.has(port)) {
    port.addEventListener('message', onReply)
    listening.add(port)
  }
  const id = crypto.randomUUID()
  return new Promise((resolve) => {
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            pending.delete(id)
            resolve(null)
          }, timeoutMs)
    pending.set(id, (reply) => {
      clearTimeout(timer)
      resolve(reply as T)
    })
    port.postMessage(JSON.stringify({ ...request, id }))
  })
}
