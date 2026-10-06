/**
 * 抓網址的標題、說明與縮圖。
 *
 * TODO(Android agent)：Android 殼走原生 JS bridge 抓（沒有 CORS 限制）；
 * 網頁版之後走 Cloudflare Worker。目前只回傳網域。
 */
export interface LinkPreview {
  title?: string
  description?: string
  site?: string
  /** 已縮小的縮圖 */
  image?: Blob
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  return { site: siteOf(url) }
}

export function siteOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}
