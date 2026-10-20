import type { BridgePort } from './nativeBridge'

/**
 * 測試用的假 bridge：收到請求後非同步回覆 respond 給的結果（帶回同一個 id）。
 * respond 回傳 undefined 就不回覆，用來測逾時。sent 記下收到的每個請求。
 */
export function fakeBridgePort(respond: (request: Record<string, unknown>) => object | undefined = () => undefined) {
  const listeners: ((event: MessageEvent) => void)[] = []
  const sent: Record<string, unknown>[] = []
  const port: BridgePort & { sent: typeof sent } = {
    sent,
    postMessage(message) {
      const request = JSON.parse(message) as Record<string, unknown>
      sent.push(request)
      const reply = respond(request)
      if (reply === undefined) return
      const data = JSON.stringify({ ...reply, id: request.id })
      setTimeout(() => {
        for (const listener of listeners) listener(new MessageEvent('message', { data }))
      }, 0)
    },
    addEventListener(_type, listener) {
      listeners.push(listener)
    },
  }
  return port
}
