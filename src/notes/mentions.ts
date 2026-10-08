import { WIKILINK, normalizeTitle } from './links'
import type { Note } from './types'

/**
 * 反向連結要顯示「在哪裡提到這頁」，以及把沒加 [[ ]] 的提及改成連結。
 * 搜尋時先把程式碼、連結、網址換成等長的空白，位置就能直接對回原文。
 */

export interface Mention {
  index: number
  length: number
}

export interface Snippet {
  before: string
  match: string
  after: string
}

const CODE_BLOCK = /```[\s\S]*?```/g
const INLINE_CODE = /`[^`\n]*`/g
const MD_LINK_URL = /\]\([^)\n]*\)/g
const BARE_URL = /https?:\/\/[^\s)]+/g
const TAG = /(?:^|\s)#[\p{L}\p{N}_\-/]+/gu

function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, (m) => m.replace(/[^\n]/g, ' '))
}

function blankCode(text: string): string {
  return blank(blank(text, CODE_BLOCK), INLINE_CODE)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 內文裡第一個指向 title 的 [[連結]]（含別名寫法） */
export function findLinkMention(body: string, title: string): Mention | null {
  const key = normalizeTitle(title)
  for (const m of blankCode(body).matchAll(WIKILINK)) {
    if (normalizeTitle(m[1]) === key) return { index: m.index, length: m[0].length }
  }
  return null
}

/**
 * 內文裡第一個「提到標題但沒有加 [[ ]]」的位置，不分大小寫。
 * 標題少於 2 個字太容易誤判，不找；英數開頭結尾的標題要整個字相符，"cat" 不會配到 "category"。
 */
export function findUnlinkedMention(body: string, title: string): Mention | null {
  const key = title.trim()
  if ([...key].length < 2 || /[[\]|\n]/.test(key)) return null
  let text = blankCode(body)
  for (const pattern of [WIKILINK, MD_LINK_URL, BARE_URL, TAG]) text = blank(text, pattern)
  const word = /[A-Za-z0-9_]/
  const before = word.test(key[0]) ? '(?<![A-Za-z0-9_])' : ''
  const after = word.test(key[key.length - 1]) ? '(?![A-Za-z0-9_])' : ''
  const m = new RegExp(before + escapeRegExp(key) + after, 'i').exec(text)
  return m ? { index: m.index, length: m[0].length } : null
}

/** 把第一個未連結的提及改成 [[標題]]；大小寫不同時保留原文當別名。找不到就原樣回傳 */
export function linkMention(body: string, title: string): string {
  const mention = findUnlinkedMention(body, title)
  if (!mention) return body
  const key = title.trim()
  const original = body.slice(mention.index, mention.index + mention.length)
  const link = original === key ? `[[${key}]]` : `[[${key}|${original}]]`
  return body.slice(0, mention.index) + link + body.slice(mention.index + mention.length)
}

/** 提及所在的那一行，太長時前後截掉 */
export function snippetAt(body: string, mention: Mention, maxBefore = 30, maxAfter = 60): Snippet {
  const end = mention.index + mention.length
  const lineStart = body.lastIndexOf('\n', mention.index - 1) + 1
  const newline = body.indexOf('\n', end)
  const lineEnd = newline === -1 ? body.length : newline
  let before = body.slice(lineStart, mention.index).trimStart()
  let after = body.slice(end, lineEnd).trimEnd()
  if (before.length > maxBefore) before = '…' + before.slice(-maxBefore)
  if (after.length > maxAfter) after = after.slice(0, maxAfter) + '…'
  return { before, match: body.slice(mention.index, end), after }
}

// 同一則筆記（物件沒換）找同一個標題，結果一定一樣；反向連結區塊每次存檔都會對全部筆記找一次
const unlinkedCache = new WeakMap<Note, Map<string, Mention | null>>()

/** findUnlinkedMention 的快取版，給要對很多則筆記一起找的地方用 */
export function noteUnlinkedMention(note: Note, title: string): Mention | null {
  let byTitle = unlinkedCache.get(note)
  if (!byTitle) {
    byTitle = new Map()
    unlinkedCache.set(note, byTitle)
  }
  if (!byTitle.has(title)) byTitle.set(title, findUnlinkedMention(note.body, title))
  return byTitle.get(title)!
}
