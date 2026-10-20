/**
 * 文字上色。Markdown 沒有顏色語法，用 Obsidian 使用者常見的寫法存成 HTML：
 *   文字顏色  <span style="color:#e5484d">文字</span>
 *   背景顏色  <mark style="background:rgba(…)">文字</mark>
 *   螢光標記  ==文字==（Obsidian 語法，預設黃色）
 * 其他軟體不認得時會退回純文字，內容不會壞。
 * 顏色選在深淺底色上都看得清楚的中間色；背景用半透明，深色模式也不刺眼。
 */
export interface ColorChoice {
  id: string
  label: string
  value: string
}

export const TEXT_COLORS: ColorChoice[] = [
  { id: 'gray', label: '灰色', value: '#8b8d98' },
  { id: 'brown', label: '棕色', value: '#a0703c' },
  { id: 'orange', label: '橘色', value: '#f76b15' },
  { id: 'yellow', label: '黃色', value: '#c99400' },
  { id: 'green', label: '綠色', value: '#30a46c' },
  { id: 'blue', label: '藍色', value: '#3e7bfa' },
  { id: 'purple', label: '紫色', value: '#8e4ec6' },
  { id: 'pink', label: '粉紅', value: '#d6409f' },
  { id: 'red', label: '紅色', value: '#e5484d' },
]

export const BG_COLORS: ColorChoice[] = [
  { id: 'gray', label: '灰底', value: 'rgba(139, 141, 152, 0.25)' },
  { id: 'brown', label: '棕底', value: 'rgba(160, 112, 60, 0.25)' },
  { id: 'orange', label: '橘底', value: 'rgba(247, 107, 21, 0.25)' },
  { id: 'yellow', label: '黃底', value: 'rgba(255, 200, 0, 0.35)' },
  { id: 'green', label: '綠底', value: 'rgba(48, 164, 108, 0.25)' },
  { id: 'blue', label: '藍底', value: 'rgba(62, 123, 250, 0.22)' },
  { id: 'purple', label: '紫底', value: 'rgba(142, 78, 198, 0.22)' },
  { id: 'pink', label: '粉紅底', value: 'rgba(214, 64, 159, 0.22)' },
  { id: 'red', label: '紅底', value: 'rgba(229, 72, 77, 0.22)' },
]

/** ==螢光== 的顏色 */
export const HIGHLIGHT = 'rgba(255, 200, 0, 0.35)'

export type ColorKind = 'text' | 'bg'

export function colorTags(kind: ColorKind, value: string): { open: string; close: string } {
  return kind === 'text'
    ? { open: `<span style="color:${value}">`, close: '</span>' }
    : { open: `<mark style="background:${value}">`, close: '</mark>' }
}

/** 只接受 #hex 與 rgb()/rgba()，其他寫法（url()、expression…）一律當成普通文字 */
export const COLOR_VALUE = String.raw`#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)`

/** 開頭標籤，group 1 是 span/mark，group 2 是顏色值 */
export const COLOR_OPEN = new RegExp(String.raw`^<(span) style="color:\s*(${COLOR_VALUE})\s*;?">|^<(mark) style="background(?:-color)?:\s*(${COLOR_VALUE})\s*;?">`)

export function matchColorOpen(text: string): { tag: 'span' | 'mark'; color: string; length: number } | null {
  const m = COLOR_OPEN.exec(text)
  if (!m) return null
  if (m[1]) return { tag: 'span', color: m[2], length: m[0].length }
  return { tag: 'mark', color: m[4], length: m[0].length }
}
