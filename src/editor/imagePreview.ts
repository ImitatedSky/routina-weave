import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import { attachmentIdFromSrc } from '@/notes/images'
import { getAttachment } from '@/storage/db'

/**
 * 編輯器裡直接顯示圖片：游標不在那一行時，![說明](路徑) 換成圖片本身。
 * 上傳的圖片從本機附件讀，網址圖片直接載入。
 */
class ImageWidget extends WidgetType {
  readonly src: string
  readonly alt: string

  constructor(src: string, alt: string) {
    super()
    this.src = src
    this.alt = alt
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt
  }

  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image'
    const img = document.createElement('img')
    img.alt = this.alt
    const id = attachmentIdFromSrc(this.src)
    if (id) {
      void getAttachment(id).then((a) => {
        if (!a) {
          wrap.textContent = '（圖片不見了）'
          return
        }
        const url = URL.createObjectURL(a.blob)
        objectUrls.set(wrap, url)
        img.src = url
      })
    } else {
      img.src = this.src
      img.referrerPolicy = 'no-referrer'
    }
    wrap.appendChild(img)
    return wrap
  }

  destroy(dom: HTMLElement) {
    const url = objectUrls.get(dom)
    if (url) URL.revokeObjectURL(url)
  }

  get estimatedHeight() {
    return 200
  }
}

const objectUrls = new WeakMap<HTMLElement, string>()

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
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'Image') return
        if (active.has(state.doc.lineAt(node.from).number)) return false
        const text = state.sliceDoc(node.from, node.to)
        const m = /^!\[([^\]]*)\]\(\s*([^)\s]+)/.exec(text)
        // 只顯示本機附件與 http(s) 圖片，其他寫法（相對路徑、data:）照原文
        if (m && (attachmentIdFromSrc(m[2]) || /^https?:\/\//i.test(m[2]))) {
          decos.push(Decoration.replace({ widget: new ImageWidget(m[2], m[1]) }).range(node.from, node.to))
        }
        return false
      },
    })
  }
  return Decoration.set(decos, true)
}

export const imagePreview = ViewPlugin.fromClass(
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

export const imagePreviewStyles = EditorView.theme({
  '.cm-image': { display: 'block', padding: '4px 0' },
  '.cm-image img': { display: 'block', maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px' },
})
