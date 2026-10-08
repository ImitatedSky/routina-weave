import type { Completion } from '@codemirror/autocomplete'
import { BG_COLORS, HIGHLIGHT, TEXT_COLORS } from '@/notes/colors'

/**
 * / 選單每一項的外觀：左邊一個預覽小方塊（像 Notion），名稱本身也套上插入後的樣子，
 * 例如標題是大字、粗體是粗的、分隔線右邊畫一條線。
 */
/** 例如 h1、divider、tip；顏色項目是 text-red、bg-yellow 這種 */
export type Look = string

export interface SlashCompletion extends Completion {
  look: Look
}

const TILES: Record<string, string> = {
  h1: 'H1', h2: 'H2', h3: 'H3', page: '📄', wikilink: '[[ ]]',
  bullet: '•', number: '1.', todo: '☑',
  divider: '—', quote: '❝', fold: '▸', code: '</>', table: '▦',
  note: '📝', tip: '💡', info: 'ℹ️', warning: '⚠️', danger: '⛔', question: '❓',
  bookmark: '🔖', link: '🔗', image: '🖼️',
  bold: 'B', italic: 'I', strike: 'S', inlinecode: '`', tag: '#',
  date: '📅', time: '🕒', datetime: '🗓️', highlight: 'A',
}

function lookOf(completion: Completion): Look | undefined {
  return (completion as Partial<SlashCompletion>).look
}

/** 給 autocompletion 的 optionClass：只對 / 選單的項目加 class，[[ 選單不受影響 */
export function slashOptionClass(completion: Completion): string {
  const look = lookOf(completion)
  return look ? `cm-slash-opt cm-slash-${look}` : ''
}

/** 左邊的預覽方塊 */
export function renderSlashTile(completion: Completion): Node | null {
  const look = lookOf(completion)
  if (!look) return null
  const tile = document.createElement('span')
  tile.className = 'cm-slash-tile'
  // 顏色項目一律顯示 A，顏色由樣式決定
  tile.textContent = TILES[look] ?? 'A'
  return tile
}

/** 分隔線在名稱右邊多畫一條線，其他項目不加東西 */
export function renderSlashRule(completion: Completion): Node | null {
  if (lookOf(completion) !== 'divider') return null
  const rule = document.createElement('span')
  rule.className = 'cm-slash-rule'
  return rule
}

const CALLOUT_COLORS: Record<string, string> = {
  note: 'var(--primary)',
  info: 'var(--primary)',
  tip: 'oklch(0.65 0.14 160)',
  warning: 'oklch(0.75 0.15 75)',
  danger: 'var(--destructive)',
  question: 'oklch(0.6 0.15 310)',
}

const label = (look: Look) => `.cm-slash-${look} .cm-completionLabel`

/** 放進 EditorView.theme 的樣式 */
export const slashMenuStyles: Record<string, Record<string, string>> = {
  '&.cm-editor .cm-tooltip.cm-tooltip-autocomplete > ul > li.cm-slash-opt': {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '5px 8px',
  },
  '.cm-slash-tile': {
    flex: 'none',
    width: '34px',
    height: '34px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--card)',
    color: 'var(--foreground)',
    fontSize: '15px',
    fontWeight: '600',
    lineHeight: '1',
  },
  '.cm-slash-opt .cm-completionLabel': { flex: 'none' },
  '.cm-slash-opt .cm-completionDetail': { marginLeft: 'auto', paddingLeft: '12px' },

  // 名稱本身就長得像插入後的樣子
  [label('h1')]: { fontSize: '1.45em', fontWeight: '700' },
  [label('h2')]: { fontSize: '1.25em', fontWeight: '650' },
  [label('h3')]: { fontSize: '1.1em', fontWeight: '600' },
  '.cm-slash-h1 .cm-slash-tile': { fontSize: '16px', fontWeight: '800' },
  '.cm-slash-h2 .cm-slash-tile': { fontSize: '14px', fontWeight: '700' },
  '.cm-slash-h3 .cm-slash-tile': { fontSize: '12px', fontWeight: '700' },
  [label('bold')]: { fontWeight: '800' },
  '.cm-slash-bold .cm-slash-tile': { fontWeight: '900' },
  [label('italic')]: { fontStyle: 'italic' },
  '.cm-slash-italic .cm-slash-tile': { fontStyle: 'italic', fontFamily: 'Georgia, serif' },
  [label('strike')]: { textDecoration: 'line-through' },
  '.cm-slash-strike .cm-slash-tile': { textDecoration: 'line-through' },
  [label('inlinecode')]: { fontFamily: 'var(--font-mono)', background: 'var(--muted)', borderRadius: '4px', padding: '0 4px' },
  [label('code')]: { fontFamily: 'var(--font-mono)' },
  '.cm-slash-code .cm-slash-tile, .cm-slash-inlinecode .cm-slash-tile': { fontFamily: 'var(--font-mono)', fontSize: '12px' },
  [label('link')]: { color: 'var(--link)', textDecoration: 'underline', textUnderlineOffset: '3px' },
  [label('tag')]: { color: 'var(--primary)' },
  '.cm-slash-tag .cm-slash-tile': { color: 'var(--primary)' },
  [label('wikilink')]: { background: 'var(--accent)', color: 'var(--accent-foreground)', borderRadius: '4px', padding: '0 4px' },
  '.cm-slash-wikilink .cm-slash-tile': { fontSize: '10px', color: 'var(--link)' },
  [label('quote')]: { borderLeft: '3px solid var(--muted-foreground)', paddingLeft: '8px', color: 'var(--muted-foreground)' },
  '.cm-slash-number .cm-slash-tile, .cm-slash-bullet .cm-slash-tile': { fontSize: '17px' },

  // 分隔線：名稱右邊一條線
  '.cm-slash-divider .cm-completionDetail': { display: 'none' },
  '.cm-slash-rule': {
    flex: '1',
    minWidth: '40px',
    height: '0',
    borderTop: '2px solid var(--muted-foreground)',
    opacity: '0.6',
  },
  '.cm-slash-divider .cm-slash-tile': { fontSize: '20px' },

  // 文字顏色：A 和名稱都塗上那個顏色；背景顏色：方塊和名稱都鋪上底色
  ...Object.fromEntries(
    TEXT_COLORS.flatMap((c) => [
      [label(`text-${c.id}`), { color: c.value }],
      [`.cm-slash-text-${c.id} .cm-slash-tile`, { color: c.value, fontSize: '17px' }],
    ]),
  ),
  ...Object.fromEntries(
    [...BG_COLORS.map((c) => [`bg-${c.id}`, c.value]), ['highlight', HIGHLIGHT]].flatMap(([look, value]) => [
      [label(look), { background: value, borderRadius: '4px', padding: '0 4px' }],
      [`.cm-slash-${look} .cm-slash-tile`, { background: value, borderColor: 'transparent', fontSize: '17px' }],
    ]),
  ),

  // 提示框：左邊色條＋淡淡的底色，顏色跟預覽一致
  ...Object.fromEntries(
    Object.entries(CALLOUT_COLORS).flatMap(([look, color]) => [
      [label(look), { borderLeft: `3px solid ${color}`, paddingLeft: '8px' }],
      [`.cm-slash-${look} .cm-slash-tile`, { background: `color-mix(in oklch, ${color} 18%, var(--card))`, borderColor: 'transparent' }],
    ]),
  ),
}
