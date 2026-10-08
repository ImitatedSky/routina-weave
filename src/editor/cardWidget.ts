import { StateEffect, StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { CARD_LANG, cardHtml, parseCard, type LinkCard } from '@/notes/cardlink'
import { fillAttachmentImages } from '@/lib/attachmentImages'

/**
 * 編輯器裡的連結卡片：游標不在 ```cardlink 區塊裡時，整塊換成卡片；
 * 點卡片開網址，點右上角「編輯」才露出原文。
 * 換掉整行的區塊裝飾 CodeMirror 規定要由 StateField 提供，不能放在 ViewPlugin。
 */
const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

class CardWidget extends WidgetType {
  readonly card: LinkCard
  readonly source: string

  constructor(card: LinkCard, source: string) {
    super()
    this.card = card
    this.source = source
  }

  eq(other: CardWidget) {
    return other.source === this.source
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-link-card'
    wrap.innerHTML = cardHtml(this.card, escape)
    wrap.querySelector('a')!.addEventListener('click', (e) => {
      e.preventDefault()
      window.open(this.card.url, '_blank', 'noopener')
    })

    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'cm-link-card-edit'
    edit.textContent = '編輯'
    edit.addEventListener('mousedown', (e) => e.preventDefault())
    edit.addEventListener('click', () => {
      // 游標移進區塊第一行（url: 那行），卡片就會變回原文
      const pos = view.posAtDOM(wrap)
      const line = view.state.doc.lineAt(pos)
      view.dispatch({ selection: { anchor: Math.min(view.state.doc.length, line.to + 1) } })
      view.focus()
    })
    wrap.appendChild(edit)

    const cleanup = fillAttachmentImages(wrap)
    cleanups.set(wrap, cleanup)
    return wrap
  }

  destroy(dom: HTMLElement) {
    cleanups.get(dom)?.()
    cleanups.delete(dom)
  }

  get estimatedHeight() {
    return 96
  }
}

const cleanups = new WeakMap<HTMLElement, () => void>()

function build(state: EditorState, focused: boolean): DecorationSet {
  const decos: Range<Decoration>[] = []
  const { from: selFrom, to: selTo } = state.selection.main
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return
      const info = node.node.getChild('CodeInfo')
      if (!info || state.sliceDoc(info.from, info.to).trim() !== CARD_LANG) return false
      const text = state.sliceDoc(node.from, node.to)
      // 還沒打結束的 ``` 就先不要換成卡片
      if (!/\n```\s*$/.test(text)) return false
      const from = state.doc.lineAt(node.from).from
      const to = state.doc.lineAt(node.to).to
      // 只有正在編輯（有焦點）而且游標在區塊裡才露出原文。
      // 剛打開頁面時游標預設在開頭，卡片又剛好在第一行，不看焦點的話會一直顯示原文
      if (focused && selTo >= from && selFrom <= to) return false
      const code = node.node.getChild('CodeText')
      const card = code ? parseCard(state.sliceDoc(code.from, code.to)) : null
      if (card) decos.push(Decoration.replace({ widget: new CardWidget(card, text), block: true }).range(from, to))
      return false
    },
  })
  return Decoration.set(decos, true)
}

const setFocused = StateEffect.define<boolean>()

interface CardState {
  focused: boolean
  decorations: DecorationSet
}

const cardField = StateField.define<CardState>({
  create: (state) => ({ focused: false, decorations: build(state, false) }),
  update(value, tr) {
    let focused = value.focused
    for (const effect of tr.effects) if (effect.is(setFocused)) focused = effect.value
    const changed = focused !== value.focused || tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState)
    return changed ? { focused, decorations: build(tr.state, focused) } : value
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

export const cardWidgets = [
  cardField,
  EditorView.focusChangeEffect.of((_state, focusing) => setFocused.of(focusing)),
]

export const cardWidgetStyles = EditorView.theme({
  '.cm-link-card': { position: 'relative', padding: '4px 0' },
  '.cm-link-card-edit': {
    position: 'absolute',
    top: '10px',
    right: '6px',
    padding: '2px 8px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--popover)',
    color: 'var(--muted-foreground)',
    fontSize: '12px',
    opacity: '0',
    transition: 'opacity 0.15s',
  },
  // 桌機滑過才出現；手機沒有 hover，一律顯示
  '.cm-link-card:hover .cm-link-card-edit': { opacity: '1' },
  '@media (pointer: coarse)': { '.cm-link-card-edit': { opacity: '1' } },
})
