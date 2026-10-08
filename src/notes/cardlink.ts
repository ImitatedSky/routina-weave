import { parse, stringify } from 'yaml'

/**
 * 內文裡的連結卡片。格式沿用 Obsidian 外掛 Auto Card Link 的 cardlink 區塊，
 * 匯出後在 Obsidian 也看得到卡片：
 *
 * ```cardlink
 * url: https://example.com/a
 * title: 網頁標題
 * description: 說明
 * host: example.com
 * image: https://example.com/og.jpg
 * thumbnail: 1f0c…          ← Weave 自己存的縮圖（附件 id），其他軟體會忽略
 * ```
 */
export interface LinkCard {
  url: string
  title?: string
  description?: string
  host?: string
  image?: string
  thumbnail?: string
}

export const CARD_LANG = 'cardlink'

export function cardBlock(card: LinkCard): string {
  const fields: Record<string, string> = { url: card.url }
  for (const key of ['title', 'description', 'host', 'image', 'thumbnail'] as const) {
    if (card[key]) fields[key] = card[key]!
  }
  return '```' + CARD_LANG + '\n' + stringify(fields, { lineWidth: 0 }).trimEnd() + '\n```'
}

/** 區塊內容（不含 ``` 那兩行）→ 卡片。沒有合法的 http(s) 網址就回傳 null */
export function parseCard(source: string): LinkCard | null {
  let data: unknown
  try {
    data = parse(source)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const get = (key: string) => {
    const value = (data as Record<string, unknown>)[key]
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }
  const url = get('url')
  if (!url || !/^https?:\/\//i.test(url)) return null
  const image = get('image')
  return {
    url,
    title: get('title'),
    description: get('description'),
    host: get('host'),
    // 只接受 http(s) 圖片，避免 javascript: 之類的東西進到 <img>
    image: image && /^https?:\/\//i.test(image) ? image : undefined,
    thumbnail: get('thumbnail'),
  }
}

/** 內文裡所有卡片用到的縮圖附件（刪筆記時一起清掉） */
export function cardThumbnails(body: string): string[] {
  const ids: string[] = []
  for (const m of body.matchAll(/```cardlink\n([\s\S]*?)\n```/g)) {
    const card = parseCard(m[1])
    if (card?.thumbnail) ids.push(card.thumbnail)
  }
  return ids
}

/** 卡片的 HTML（預覽與編輯器共用）。所有文字都經過跳脫；縮圖由呼叫端依 data-attachment 補上 */
export function cardHtml(card: LinkCard, escape: (text: string) => string): string {
  const host = card.host ?? hostOf(card.url)
  const title = card.title ?? host ?? card.url
  const thumb = card.thumbnail
    ? `<span class="link-card-thumb"><img alt="" data-attachment="${escape(card.thumbnail)}"></span>`
    : ''
  const description = card.description ? `<span class="link-card-desc">${escape(card.description)}</span>` : ''
  return (
    `<a class="link-card" href="${escape(card.url)}" target="_blank" rel="noopener noreferrer">` +
    `<span class="link-card-text"><span class="link-card-title">${escape(title)}</span>${description}` +
    `<span class="link-card-host">${escape(host ?? card.url)}</span></span>${thumb}</a>`
  )
}

export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}
