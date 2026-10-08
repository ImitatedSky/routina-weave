/**
 * 頁面封面。frontmatter 的 cover 有兩種值：
 *   preset:<id>   內建的漸層或純色（不用找圖也能用，像 Notion 預設的封面庫）
 *   其他          附件 id（使用者挑的圖片，存在 IndexedDB，匯出時放 _attachments/）
 */
export interface CoverPreset {
  id: string
  label: string
  css: string
}

export const COVER_PRESETS: CoverPreset[] = [
  { id: 'dawn', label: '晨曦', css: 'linear-gradient(135deg, #ffd3a5 0%, #fd6585 100%)' },
  { id: 'ocean', label: '海洋', css: 'linear-gradient(135deg, #a1c4fd 0%, #4b52b8 100%)' },
  { id: 'forest', label: '森林', css: 'linear-gradient(135deg, #c3e6a6 0%, #2f8f6b 100%)' },
  { id: 'dusk', label: '黃昏', css: 'linear-gradient(135deg, #fbc2eb 0%, #8e4ec6 100%)' },
  { id: 'sand', label: '沙丘', css: 'linear-gradient(135deg, #fdf0d5 0%, #c99a5b 100%)' },
  { id: 'night', label: '夜空', css: 'linear-gradient(135deg, #3b4371 0%, #0f1325 100%)' },
  { id: 'mint', label: '薄荷', css: 'linear-gradient(135deg, #e0f7f1 0%, #7fd1c0 100%)' },
  { id: 'peach', label: '蜜桃', css: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
  { id: 'red', label: '紅', css: '#e5484d' },
  { id: 'orange', label: '橘', css: '#f76b15' },
  { id: 'yellow', label: '黃', css: '#f5c742' },
  { id: 'green', label: '綠', css: '#30a46c' },
  { id: 'blue', label: '藍', css: '#3e7bfa' },
  { id: 'purple', label: '紫', css: '#8e4ec6' },
  { id: 'gray', label: '灰', css: '#8b8d98' },
  { id: 'paper', label: '紙', css: '#ece6da' },
]

const PRESET_PREFIX = 'preset:'

export function presetCover(id: string): string {
  return PRESET_PREFIX + id
}

/** 內建封面的 CSS background；不是內建的（圖片）回傳 undefined */
export function presetCss(cover: string): string | undefined {
  if (!cover.startsWith(PRESET_PREFIX)) return undefined
  const id = cover.slice(PRESET_PREFIX.length)
  return COVER_PRESETS.find((p) => p.id === id)?.css
}

/** 封面是附件圖片時回傳附件 id */
export function coverAttachment(cover: string | undefined): string | undefined {
  return cover && !cover.startsWith(PRESET_PREFIX) ? cover : undefined
}
