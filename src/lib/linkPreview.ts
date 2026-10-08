/**
 * 抓網址的標題、說明與縮圖。
 *
 * 網頁直接 fetch 別的網站會被 CORS 擋，所以：
 * - Android 殼：走原生的 JS bridge（android/.../LinkPreviewer.kt）。
 * - 網頁版：目前只回傳網域。之後改走自己的 Cloudflare Worker，不呼叫第三方預覽服務，
 *   使用者存的網址才不會外流。
 */
export interface LinkPreview {
  title?: string
  description?: string
  site?: string
  /** 已縮小的縮圖 */
  image?: Blob
  /** 原圖網址（只是記下來，畫面上用的是縮圖） */
  imageUrl?: string
}

interface LinkBridge {
  fetchPreview(id: string, url: string): void
}

/** bridge 回傳的 JSON。image 是 JPEG 的 base64 */
interface BridgeResult {
  ok: boolean
  title?: string
  description?: string
  site?: string
  image?: string
  imageUrl?: string
  error?: string
}

declare global {
  interface Window {
    RoutinaWeaveLinks?: LinkBridge
    __weavePreviewResult?: (id: string, json: string) => void
  }
}

// 原生端每次連線最多 8 秒、最多轉址 5 次，再加上下載縮圖，20 秒還沒回來就放棄
const TIMEOUT_MS = 20_000
const MAX_TITLE = 200
const MAX_DESCRIPTION = 500

const pending = new Map<string, (result: BridgeResult | null) => void>()

function onBridgeResult(id: string, json: string) {
  const resolve = pending.get(id)
  if (!resolve) return
  pending.delete(id)
  try {
    resolve(JSON.parse(json) as BridgeResult)
  } catch {
    resolve(null)
  }
}

function askBridge(bridge: LinkBridge, url: string): Promise<BridgeResult | null> {
  window.__weavePreviewResult ??= onBridgeResult
  const id = crypto.randomUUID()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve(null)
    }, TIMEOUT_MS)
    pending.set(id, (result) => {
      clearTimeout(timer)
      resolve(result)
    })
    bridge.fetchPreview(id, url)
  })
}

/** 抓不到也不會失敗，至少回傳網域 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const site = siteOf(url)
  const bridge = window.RoutinaWeaveLinks
  if (!bridge) return { site }

  const result = await askBridge(bridge, url)
  if (!result?.ok) return { site }
  return {
    title: clip(result.title, MAX_TITLE),
    description: clip(result.description, MAX_DESCRIPTION),
    site: clip(result.site, MAX_TITLE) ?? site,
    image: result.image ? base64ToBlob(result.image, 'image/jpeg') : undefined,
    imageUrl: result.imageUrl && /^https?:\/\//i.test(result.imageUrl) ? result.imageUrl : undefined,
  }
}

export function siteOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function clip(text: string | undefined, max: number): string | undefined {
  const trimmed = text?.replace(/\s+/g, ' ').trim()
  if (!trimmed) return undefined
  const chars = Array.from(trimmed)
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : trimmed
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}
