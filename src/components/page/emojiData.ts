/**
 * 圖示選擇器的 emoji 資料：emojibase 的繁體中文版（名稱與關鍵字都是中文，可以直接搜尋）。
 * 資料約 700KB，打開選擇器時才載入。
 */
export interface EmojiItem {
  emoji: string
  label: string
  tags: string[]
  group: number
  version: number
}

export interface EmojiGroup {
  id: number
  label: string
  items: EmojiItem[]
}

// emojibase 的分類順序；2 是膚色等「元件」，不是給人挑的，略過
const GROUP_LABELS: Record<number, string> = {
  0: '笑臉和情緒',
  1: '人物和身體',
  3: '動物和自然',
  4: '食物和飲料',
  5: '旅遊和地點',
  6: '活動',
  7: '物品',
  8: '符號',
  9: '旗幟',
}

interface RawEmoji {
  emoji: string
  label: string
  tags?: string[]
  group?: number
  order?: number
  version: number
}

let loaded: Promise<EmojiGroup[]> | null = null

export function loadEmojiGroups(): Promise<EmojiGroup[]> {
  loaded ??= import('emojibase-data/zh-hant/data.json').then((mod) => {
    const data = (mod as unknown as { default: RawEmoji[] }).default
    return groupEmoji(data, maxSupportedVersion())
  })
  return loaded
}

/** 依分類整理，濾掉這台裝置畫不出來的新版 emoji */
export function groupEmoji(data: RawEmoji[], maxVersion: number): EmojiGroup[] {
  const groups = new Map<number, EmojiItem[]>()
  const sorted = [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  for (const e of sorted) {
    if (e.group === undefined || !(e.group in GROUP_LABELS) || e.version > maxVersion) continue
    if (!groups.has(e.group)) groups.set(e.group, [])
    groups.get(e.group)!.push({ emoji: e.emoji, label: e.label, tags: e.tags ?? [], group: e.group, version: e.version })
  }
  return [...groups].sort((a, b) => a[0] - b[0]).map(([id, items]) => ({ id, label: GROUP_LABELS[id], items }))
}

/** 用中文名稱、關鍵字或 emoji 本身搜尋；名稱開頭相同的排前面 */
export function searchEmoji(groups: EmojiGroup[], query: string, limit = 120): EmojiItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const starts: EmojiItem[] = []
  const contains: EmojiItem[] = []
  for (const group of groups) {
    for (const item of group.items) {
      if (item.emoji === q || item.label.startsWith(q)) starts.push(item)
      else if (item.label.includes(q) || item.tags.some((t) => t.includes(q))) contains.push(item)
    }
  }
  return [...starts, ...contains].slice(0, limit)
}

// 每個 emoji 版本挑一個代表，從新到舊試，第一個畫得出來的就是這台裝置支援的最新版本
const PROBES: [number, string][] = [
  [16, '🫩'],
  [15.1, '🙂‍↕️'],
  [15, '🫨'],
  [14, '🫠'],
  [13, '🥲'],
  [12, '🥱'],
  [11, '🥰'],
]

let cachedMax: number | null = null

/**
 * 這台裝置能畫出來的最新 emoji 版本。彩色 emoji 不受文字顏色影響，畫不出來時的方框會，
 * 所以分別用黑字和白字畫一次，像素一樣才算支援；ZWJ 組合字畫不出來時會拆成兩個，寬度會變兩倍。
 * 沒有 canvas（測試環境）就不過濾。
 */
export function maxSupportedVersion(): number {
  if (cachedMax !== null) return cachedMax
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return (cachedMax = Infinity)
  ctx.font = '24px sans-serif'
  ctx.textBaseline = 'top'
  const base = ctx.measureText('😀').width
  const draw = (emoji: string, color: string) => {
    ctx.clearRect(0, 0, 32, 32)
    ctx.fillStyle = color
    ctx.fillText(emoji, 0, 0)
    return ctx.getImageData(0, 0, 32, 32).data
  }
  const supported = (emoji: string) => {
    if (ctx.measureText(emoji).width > base * 1.5) return false
    const black = draw(emoji, '#000')
    const white = draw(emoji, '#fff')
    let painted = false
    for (let i = 0; i < black.length; i += 4) {
      if (black[i + 3] === 0) continue
      painted = true
      if (Math.abs(black[i] - white[i]) > 40) return false
    }
    return painted
  }
  cachedMax = PROBES.find(([, emoji]) => supported(emoji))?.[0] ?? 11
  return cachedMax
}

// ---- 最近用過（只是這台裝置的方便功能，存不了也沒關係）----
const RECENT_KEY = 'weave-recent-emoji'

export function recentEmoji(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((e) => typeof e === 'string').slice(0, 24) : []
  } catch {
    return []
  }
}

export function rememberEmoji(emoji: string) {
  try {
    const list = [emoji, ...recentEmoji().filter((e) => e !== emoji)].slice(0, 24)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // 不記住而已
  }
}
