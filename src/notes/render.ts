import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { normalizeTitle } from './links'

/**
 * 預覽模式的 Markdown → HTML。內容可能來自匯入的 zip，一律經過 DOMPurify 才放進畫面。
 * 額外支援：[[連結]]、#標籤、待辦清單 - [ ]、Obsidian 的提示框 > [!note]。
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

// 提示框：> [!note] 標題
md.core.ruler.after('inline', 'callouts', (state) => {
  const tokens = state.tokens
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i].type !== 'blockquote_open' || tokens[i + 1].type !== 'paragraph_open') continue
    const inline = tokens[i + 2]
    const m = /^\[!(\w+)\][ \t]*([^\n]*)/.exec(inline.content)
    if (!m || !inline.children) continue
    const type = m[1].toLowerCase()
    tokens[i].attrSet('class', 'callout')
    tokens[i].attrSet('data-type', type)
    // 第一行換成粗體標題，其餘內容照舊
    const firstBreak = inline.children.findIndex((t) => t.type === 'softbreak' || t.type === 'hardbreak')
    const rest = firstBreak >= 0 ? inline.children.slice(firstBreak + 1) : []
    const title = new state.Token('html_inline', '', 0)
    title.content = `<div class="callout-title">${md.utils.escapeHtml(m[2] || type)}</div>`
    inline.children = [title, ...rest]
  }
})

export function renderMarkdown(body: string, ctx: RenderContext): string {
  context = ctx
  const html = md.render(body)
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-wikilink', 'data-title', 'data-task', 'data-type'] })
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
