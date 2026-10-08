import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { normalizeTitle } from './links'
import { HIGHLIGHT, matchColorOpen } from './colors'
import { CARD_LANG, cardHtml, parseCard } from './cardlink'
import { attachmentIdFromSrc } from './images'

/**
 * 預覽模式的 Markdown → HTML。內容可能來自匯入的 zip，一律經過 DOMPurify 才放進畫面。
 * 額外支援：[[連結]]、#標籤、待辦清單 - [ ]、Obsidian 的提示框 > [!note]、文字上色與 ==螢光==。
 */

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// 點連結時由 Preview 元件攔下來處理，這裡只負責標記
md.inline.ruler.before('link', 'wikilink', (state, silent) => {
  const src = state.src.slice(state.pos)
  const m = /^\[\[([^[\]\n|]+)(?:\|([^[\]\n]*))?\]\]/.exec(src)
  if (!m) return false
  if (!silent) {
    const token = state.push('wikilink', '', 0)
    token.meta = { target: m[1].trim(), alias: m[2]?.trim() }
  }
  state.pos += m[0].length
  return true
})

md.inline.ruler.after('wikilink', 'hashtag', (state, silent) => {
  if (state.src[state.pos] !== '#') return false
  const prev = state.pos === 0 ? ' ' : state.src[state.pos - 1]
  if (!/\s/.test(prev)) return false
  const m = /^#([\p{L}\p{N}_\-/]+)/u.exec(state.src.slice(state.pos))
  if (!m || /^\d+$/.test(m[1])) return false
  if (!silent) {
    const token = state.push('hashtag', '', 0)
    token.meta = { tag: m[1] }
  }
  state.pos += m[0].length
  return true
})

/**
 * 上色：只認 colors.ts 定義的 <span style="color:…"> 與 <mark style="background:…">，
 * 以及 ==螢光==。其他 HTML 照樣當純文字顯示（html: false）。
 * 中間的文字照常解析，所以上色的字裡面還是可以有粗體、連結。
 */
type InlineState = Parameters<Parameters<typeof md.inline.ruler.push>[1]>[0]

function wrapInline(state: InlineState, innerStart: number, innerEnd: number, after: number, open: string, close: string) {
  const oldMax = state.posMax
  state.push('html_inline', '', 0).content = open
  state.pos = innerStart
  state.posMax = innerEnd
  state.md.inline.tokenize(state)
  state.posMax = oldMax
  state.pos = after
  state.push('html_inline', '', 0).content = close
}

md.inline.ruler.before('emphasis', 'color', (state, silent) => {
  if (state.src[state.pos] !== '<') return false
  const open = matchColorOpen(state.src.slice(state.pos, state.posMax))
  if (!open) return false
  const closeTag = `</${open.tag}>`
  const innerStart = state.pos + open.length
  const innerEnd = state.src.indexOf(closeTag, innerStart)
  if (innerEnd < 0 || innerEnd + closeTag.length > state.posMax) return false
  const after = innerEnd + closeTag.length
  if (silent) {
    state.pos = after
    return true
  }
  const style = open.tag === 'span' ? `color:${open.color}` : `background:${open.color}`
  wrapInline(state, innerStart, innerEnd, after, `<${open.tag} style="${style}">`, closeTag)
  return true
})

md.inline.ruler.before('emphasis', 'highlight', (state, silent) => {
  if (!state.src.startsWith('==', state.pos)) return false
  const innerStart = state.pos + 2
  const innerEnd = state.src.indexOf('==', innerStart)
  if (innerEnd <= innerStart || innerEnd + 2 > state.posMax) return false
  // 跟 Obsidian 一樣：== 後面緊接空白不算
  if (/\s/.test(state.src[innerStart]) || /\s/.test(state.src[innerEnd - 1])) return false
  if (silent) {
    state.pos = innerEnd + 2
    return true
  }
  wrapInline(state, innerStart, innerEnd, innerEnd + 2, `<mark style="background:${HIGHLIGHT}">`, '</mark>')
  return true
})

// ```cardlink 區塊畫成連結卡片；格式不對就照一般程式碼區塊顯示
const defaultFence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  if (token.info.trim() === CARD_LANG) {
    const card = parseCard(token.content)
    if (card) return cardHtml(card, md.utils.escapeHtml)
  }
  return defaultFence(tokens, idx, options, env, self)
}

// 上傳的圖片（_attachments/…）存在本機，src 由 Preview 讀附件後補上；網址圖片照常顯示
const defaultImage = md.renderer.rules.image!
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const id = attachmentIdFromSrc(String(token.attrGet('src') ?? ''))
  if (!id) return defaultImage(tokens, idx, options, env, self)
  const alt = md.utils.escapeHtml(token.content)
  return `<img alt="${alt}" data-attachment="${md.utils.escapeHtml(id)}">`
}

export interface RenderContext {
  /** 標題存在嗎？不存在的連結畫成虛線 */
  exists: (title: string) => boolean
}

let context: RenderContext = { exists: () => true }

md.renderer.rules.wikilink = (tokens, idx) => {
  const { target, alias } = tokens[idx].meta as { target: string; alias?: string }
  const cls = context.exists(target) ? 'wikilink' : 'wikilink missing'
  return `<a href="#" class="${cls}" data-wikilink="${md.utils.escapeHtml(normalizeTitle(target))}" data-title="${md.utils.escapeHtml(target)}">${md.utils.escapeHtml(alias || target)}</a>`
}

md.renderer.rules.hashtag = (tokens, idx) => {
  const { tag } = tokens[idx].meta as { tag: string }
  return `<a href="#/tag/${encodeURIComponent(tag)}" class="tag">#${md.utils.escapeHtml(tag)}</a>`
}

// 待辦清單：行首的 [ ] / [x] 換成核取方塊，data-task 記錄是第幾個，點了可以回寫原文
md.core.ruler.after('inline', 'tasks', (state) => {
  let taskIndex = 0
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]
    if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue
    const m = /^\[([ xX])\]\s/.exec(inline.content)
    if (!m) continue
    const first = inline.children?.[0]
    if (!first || first.type !== 'text') continue
    first.content = first.content.replace(/^\[[ xX]\]\s/, '')
    const box = new state.Token('html_inline', '', 0)
    box.content = `<input type="checkbox" data-task="${taskIndex++}"${m[1] !== ' ' ? ' checked' : ''}>`
    inline.children!.unshift(box)
    tokens[i - 2].attrJoin('class', 'task')
  }
})

// 提示框：> [!note] 標題。類型後面加 - 是預設收合、+ 是預設展開（Obsidian 的摺疊語法）
md.core.ruler.after('inline', 'callouts', (state) => {
  const tokens = state.tokens
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i].type !== 'blockquote_open' || tokens[i + 1].type !== 'paragraph_open') continue
    const inline = tokens[i + 2]
    const m = /^\[!(\w+)\]([+-]?)[ \t]*([^\n]*)/.exec(inline.content)
    if (!m || !inline.children) continue
    const type = m[1].toLowerCase()
    tokens[i].attrSet('class', 'callout')
    tokens[i].attrSet('data-type', type)
    if (m[2]) tokens[i].attrSet('data-fold', m[2] === '-' ? 'closed' : 'open')
    // 標題獨立成一個區塊，收合時才能只留標題；第一段剩下的內容照舊
    const title = new state.Token('html_block', '', 0)
    title.content = `<div class="callout-title">${md.utils.escapeHtml(m[3] || type)}</div>`
    tokens.splice(i + 1, 0, title)
    const firstBreak = inline.children.findIndex((t) => t.type === 'softbreak' || t.type === 'hardbreak')
    inline.children = firstBreak >= 0 ? inline.children.slice(firstBreak + 1) : []
  }
})

export function renderMarkdown(body: string, ctx: RenderContext): string {
  context = ctx
  const html = md.render(body)
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-wikilink', 'data-title', 'data-task', 'data-type', 'data-fold', 'data-attachment', 'target'] })
}

/** 把第 index 個待辦的勾選狀態寫回原文 */
export function toggleTask(body: string, index: number): string {
  let count = 0
  let inFence = false
  return body
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) inFence = !inFence
      if (inFence) return line
      const m = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](\s)/.exec(line)
      if (!m) return line
      if (count++ !== index) return line
      return m[1] + (m[2] === ' ' ? '[x]' : '[ ]') + m[3] + line.slice(m[0].length)
    })
    .join('\n')
}
