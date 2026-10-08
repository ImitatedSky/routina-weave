import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { Range } from '@codemirror/state'
import { HIGHLIGHT, matchColorOpen } from '@/notes/colors'
import { inCode } from './syntax'

/**
 * 編輯器裡的上色：<span style="color:…">、<mark style="background:…">、==螢光==。
 * 游標不在的行把標籤藏起來只顯示顏色；游標所在的行留著原文方便改，但字一樣上色。
 * 規則跟預覽（render.ts）一致：開頭與結束標籤要在同一行。
 */
const hide = Decoration.replace({})

function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>()
  if (!view.hasFocus) return lines
  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number
    const last = view.state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) lines.add(n)
  }
  return lines
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const active = activeLines(view)
  const decos: Range<Decoration>[] = []

  const add = (lineFrom: number, openFrom: number, openTo: number, closeFrom: number, closeTo: number, style: string, raw: boolean) => {
    if (inCode(state, lineFrom + openFrom)) return
    if (!raw) decos.push(hide.range(lineFrom + openFrom, lineFrom + openTo))
    if (closeFrom > openTo) {
      decos.push(Decoration.mark({ attributes: { style } }).range(lineFrom + openTo, lineFrom + closeFrom))
    }
    if (!raw) decos.push(hide.range(lineFrom + closeFrom, lineFrom + closeTo))
  }

  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = state.doc.lineAt(pos)
      const text = line.text
      const raw = active.has(line.number)

      for (let i = text.indexOf('<'); i >= 0; i = text.indexOf('<', i + 1)) {
        const open = matchColorOpen(text.slice(i))
        if (!open) continue
        const closeTag = `</${open.tag}>`
        const close = text.indexOf(closeTag, i + open.length)
        if (close < 0) continue
        const style = open.tag === 'span' ? `color:${open.color}` : `background:${open.color};border-radius:3px`
        add(line.from, i, i + open.length, close, close + closeTag.length, style, raw)
        i = close + closeTag.length - 1
      }

      for (const m of text.matchAll(/==(?=\S)(.+?)(?<=\S)==/g)) {
        const start = m.index
        const end = start + m[0].length
        add(line.from, start, start + 2, end - 2, end, `background:${HIGHLIGHT};border-radius:3px`, raw)
      }

      pos = line.to + 1
    }
  }
  return Decoration.set(decos, true)
}

export const colorPreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
        this.decorations = build(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
