import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { useNotes } from '@/store/notes'
import { normalizeTitle, titleIndex } from '@/notes/links'
import type { Note } from '@/notes/types'
import { taskToggle } from './format'
import { inCode } from './syntax'

/**
 * 即時預覽（Obsidian 的 Live Preview）：游標不在的行把 Markdown 記號藏起來只顯示格式，
 * 游標所在的行顯示原文。這裡只加裝飾，文件內容一個字都不動。
 */

export interface Wikilink {
  from: number
  to: number
  /** 連到的標題（[[標題|別名]] 的標題） */
  target: string
  /** 畫面上顯示的那段字 */
  textFrom: number
  textTo: number
}

const WIKILINK = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]*))?\]\]/g

/** text 裡所有的 [[連結]]，位置加上 offset（text 在文件裡的起點） */
export function findWikilinks(text: string, offset = 0): Wikilink[] {
  const links: Wikilink[] = []
  for (const m of text.matchAll(WIKILINK)) {
    const from = offset + m.index
    const to = from + m[0].length
    const targetFrom = from + 2
    const hasAlias = m[2] !== undefined && m[2].trim() !== ''
    links.push({
      from,
      to,
      target: m[1].trim(),
      textFrom: hasAlias ? targetFrom + m[1].length + 1 : targetFrom,
      textTo: hasAlias ? to - 2 : targetFrom + m[1].length,
    })
  }
  return links
}

// 每打一個字都會重畫，標題索引只在筆記有變動時重建
let indexedNotes: Record<string, Note> | null = null
let index = new Map<string, string>()
function titleExists(title: string): boolean {
  const notes = useNotes.getState().notes
  if (notes !== indexedNotes) {
    indexedNotes = notes
    index = titleIndex(Object.values(notes))
  }
  return index.has(normalizeTitle(title))
}

class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-lp-bullet'
    span.textContent = '•'
    return span
  }
  ignoreEvent() {
    return false
  }
}

class CheckboxWidget extends WidgetType {
  readonly checked: boolean
  constructor(checked: boolean) {
    super()
    this.checked = checked
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }
  toDOM() {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.className = 'cm-lp-task'
    input.checked = this.checked
    input.setAttribute('aria-label', this.checked ? '已完成' : '未完成')
    // 勾選狀態由 mousedown 改原文決定，不要讓瀏覽器自己再切一次
    input.addEventListener('click', (e) => e.preventDefault())
    return input
  }
  ignoreEvent() {
    return false
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-lp-hr'
    return span
  }
  ignoreEvent() {
    return false
  }
}

const hidden = Decoration.replace({})
const bullet = Decoration.replace({ widget: new BulletWidget() })
const rule = Decoration.replace({ widget: new RuleWidget() })
const checked = Decoration.replace({ widget: new CheckboxWidget(true) })
const unchecked = Decoration.replace({ widget: new CheckboxWidget(false) })
const inlineCode = Decoration.mark({ class: 'cm-lp-inline-code' })
const quoteLine = Decoration.line({ class: 'cm-lp-quote' })
const calloutLine = Decoration.line({ class: 'cm-lp-quote cm-lp-callout' })
const calloutTitle = Decoration.mark({ class: 'cm-lp-callout-title' })
const codeLine = Decoration.line({ class: 'cm-lp-codeblock' })

/** 游標或選取範圍碰到的行號；編輯器沒有焦點時整頁都顯示成預覽 */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>()
  if (!view.hasFocus) return lines
  const { doc } = view.state
  for (const range of view.state.selection.ranges) {
    const last = doc.lineAt(range.to).number
    for (let n = doc.lineAt(range.from).number; n <= last; n++) lines.add(n)
  }
  return lines
}

/** 記號後面緊接的空白一起藏起來，例如「# 」、「> 」 */
function withSpace(state: EditorState, to: number): number {
  return state.sliceDoc(to, to + 1) === ' ' ? to + 1 : to
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const active = activeLines(view)
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number)
  const decos: Range<Decoration>[] = []

  // 每一行只加一次行裝飾（引用、程式碼區塊可能跨好幾段 visibleRanges）
  const styledLines = new Set<number>()
  const styleLines = (from: number, to: number, deco: Decoration, rangeFrom: number, rangeTo: number) => {
    const first = state.doc.lineAt(Math.max(from, rangeFrom)).number
    const last = state.doc.lineAt(Math.min(to, rangeTo)).number
    for (let n = first; n <= last; n++) {
      if (styledLines.has(n)) continue
      styledLines.add(n)
      decos.push(deco.range(state.doc.line(n).from))
    }
  }

  for (const { from, to } of view.visibleRanges) {
    const links = findWikilinks(state.sliceDoc(from, to), from).filter((l) => !inCode(state, l.from))
    for (const link of links) {
      const missing = titleExists(link.target) ? '' : ' cm-lp-missing'
      const attributes = { 'data-wikilink': link.target }
      if (isActive(link.from)) {
        decos.push(Decoration.mark({ class: 'cm-lp-wikilink-raw', attributes }).range(link.from, link.to))
      } else {
        decos.push(hidden.range(link.from, link.textFrom))
        decos.push(
          Decoration.mark({ class: 'cm-lp-wikilink cm-lp-rendered' + missing, attributes }).range(link.textFrom, link.textTo),
        )
        decos.push(hidden.range(link.textTo, link.to))
      }
    }

    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        // [[連結]] 會被 lezer 當成 [連結] 一般連結，裡面的節點交給上面處理
        if (links.some((l) => node.from >= l.from && node.to <= l.to)) return false

        switch (node.name) {
          case 'Blockquote': {
            const line = state.doc.lineAt(node.from)
            const callout = /^(\s*>\s*)(\[!(\w+)\][+-]?\s*)(.*)$/.exec(line.text)
            styleLines(node.from, node.to, callout ? calloutLine : quoteLine, from, to)
            if (callout && line.from >= from && !isActive(line.from)) {
              // 跟預覽一樣：第一行是粗體標題，沒寫標題就顯示類型名稱
              const markerFrom = line.from + callout[1].length
              const titleFrom = markerFrom + callout[2].length
              if (callout[4]) {
                decos.push(hidden.range(markerFrom, titleFrom))
                decos.push(calloutTitle.range(titleFrom, line.to))
              } else {
                const typeFrom = markerFrom + 2
                const typeTo = typeFrom + callout[3].length
                decos.push(hidden.range(markerFrom, typeFrom))
                decos.push(calloutTitle.range(typeFrom, typeTo))
                decos.push(hidden.range(typeTo, line.to))
              }
            }
            break
          }
          case 'FencedCode':
            styleLines(node.from, node.to, codeLine, from, to)
            return false
          case 'InlineCode':
            decos.push(inlineCode.range(node.from, node.to))
            break
          case 'HorizontalRule':
            if (!isActive(node.from)) decos.push(rule.range(node.from, node.to))
            break
          case 'HeaderMark':
            if (node.node.parent?.name.startsWith('ATXHeading') && !isActive(node.from)) {
              decos.push(hidden.range(node.from, withSpace(state, node.to)))
            }
            break
          case 'QuoteMark':
            if (!isActive(node.from)) decos.push(hidden.range(node.from, withSpace(state, node.to)))
            break
          case 'EmphasisMark':
          case 'StrikethroughMark':
            if (!isActive(node.from)) decos.push(hidden.range(node.from, node.to))
            break
          case 'CodeMark':
            if (node.node.parent?.name === 'InlineCode' && !isActive(node.from)) decos.push(hidden.range(node.from, node.to))
            break
          case 'ListMark': {
            if (isActive(node.from)) break
            const marker = node.node.parent?.getChild('Task')?.getChild('TaskMarker')
            if (marker) {
              const done = state.sliceDoc(marker.from + 1, marker.to - 1).toLowerCase() === 'x'
              // 項目清單連 - 一起換成核取方塊，編號清單留著數字
              const start = node.node.parent?.parent?.name === 'BulletList' ? node.from : marker.from
              decos.push((done ? checked : unchecked).range(start, withSpace(state, marker.to)))
            } else if (node.node.parent?.parent?.name === 'BulletList') {
              decos.push(bullet.range(node.from, node.to))
            }
            break
          }
          case 'Link': {
            // 只處理 [文字](網址)；沒有網址的 [文字] 照原樣顯示
            const url = node.node.getChild('URL')
            const marks = node.node.getChildren('LinkMark')
            if (!url || marks.length < 2 || isActive(node.from)) break
            const textFrom = marks[0].to
            const textTo = marks[1].from
            if (textFrom === textTo || state.doc.lineAt(node.from).number !== state.doc.lineAt(node.to).number) break
            decos.push(hidden.range(node.from, textFrom))
            decos.push(
              Decoration.mark({ class: 'cm-lp-link', attributes: { 'data-url': state.sliceDoc(url.from, url.to) } }).range(
                textFrom,
                textTo,
              ),
            )
            decos.push(hidden.range(textTo, node.to))
            break
          }
        }
      },
    })
  }
  return Decoration.set(decos, true)
}

/** 點核取方塊：把原文的 [ ] / [x] 換掉 */
function toggleTaskAt(view: EditorView, pos: number): boolean {
  const line = view.state.doc.lineAt(pos)
  const toggle = taskToggle(line.text)
  if (!toggle) return false
  const at = line.from + toggle.offset
  view.dispatch({ changes: { from: at, to: at + 1, insert: toggle.insert }, userEvent: 'input' })
  return true
}

export function livePreview(onOpenLink: (title: string) => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view)
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          update.focusChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.decorations = buildDecorations(update.view)
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        // 用 mousedown 而不是 click：要在編輯器移動游標（把這行切回原文）之前攔下來
        mousedown(event, view) {
          if (event.button !== 0) return false
          const target = event.target as HTMLElement

          if (target instanceof HTMLInputElement && target.classList.contains('cm-lp-task')) {
            event.preventDefault()
            return toggleTaskAt(view, view.posAtDOM(target))
          }

          // 預覽中的連結直接點就跳；正在編輯的行要按住 Ctrl/⌘
          const wikilink = target.closest<HTMLElement>('[data-wikilink]')
          if (wikilink && (wikilink.classList.contains('cm-lp-rendered') || event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            onOpenLink(wikilink.dataset.wikilink!)
            return true
          }

          // 外部連結：網頁版開新分頁；Android 殼會攔下來交給瀏覽器
          const link = target.closest<HTMLElement>('[data-url]')
          if (link && /^https?:\/\//.test(link.dataset.url!)) {
            event.preventDefault()
            window.open(link.dataset.url, '_blank', 'noopener')
            return true
          }
          return false
        },
      },
    },
  )
}
