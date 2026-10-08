import { EditorView } from '@codemirror/view'
import { fetchLinkPreview } from '@/lib/linkPreview'
import { putAttachment } from '@/storage/db'
import { useNotes } from '@/store/notes'
import { parseRoute } from '@/store/route'
import { cardBlock, hostOf, type LinkCard } from '@/notes/cardlink'
import { inCode } from './syntax'

/**
 * 貼上網址（剪貼簿裡只有一個 http(s) 網址）時：
 * - 空白行：變成連結卡片（標題、說明、縮圖），像 Notion 的書籤
 * - 句子中間：變成 [網頁標題](網址)
 * - 有選字：選的字變成連結
 * 先放一個只有網址的版本，背景抓到預覽後再換成完整的。
 * 程式碼裡照原樣貼上。
 */
export function pastedUrl(text: string | undefined): string | null {
  const value = text?.trim()
  if (!value || /\s/.test(value) || !/^https?:\/\/[^/\s]+\.[^/\s]/i.test(value)) return null
  try {
    new URL(value)
    return value
  } catch {
    return null
  }
}

/** 連結文字裡的 [ ] 會讓 Markdown 斷掉，換成全形 */
export function linkText(text: string): string {
  return text.replace(/\[/g, '［').replace(/\]/g, '］').replace(/\s+/g, ' ').trim()
}

/** 網址裡的括號會讓 [文字](網址) 提早結束 */
export function linkTarget(url: string): string {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29')
}

export const pasteLink = EditorView.domEventHandlers({
  paste(event, view) {
    const url = pastedUrl(event.clipboardData?.getData('text/plain'))
    if (!url) return false
    const { state } = view
    const range = state.selection.main
    if (inCode(state, range.from)) return false
    event.preventDefault()

    const line = state.doc.lineAt(range.from)
    const target = linkTarget(url)
    const route = parseRoute(location.hash)
    const noteId = route.kind === 'page' ? route.id : null

    // 有選字：選的字變成連結，不用等預覽
    if (!range.empty) {
      const insert = `[${linkText(state.sliceDoc(range.from, range.to))}](${target})`
      view.dispatch({ changes: { from: range.from, to: range.to, insert }, userEvent: 'input.paste' })
      return true
    }

    const onEmptyLine = line.text.trim() === '' && line.from === state.doc.lineAt(range.to).from
    const host = hostOf(url)
    const placeholder = onEmptyLine ? cardBlock({ url, host }) : `[${linkText(host ?? url)}](${target})`
    const insert = onEmptyLine ? placeholder + '\n' : placeholder
    const from = onEmptyLine ? line.from : range.from
    const to = onEmptyLine ? line.to : range.to
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      userEvent: 'input.paste',
      scrollIntoView: true,
    })

    void fetchLinkPreview(url).then(async (preview) => {
      let full: string
      if (onEmptyLine) {
        const card: LinkCard = { url, host, title: preview.title, description: preview.description, image: preview.imageUrl }
        if (preview.image) {
          const id = crypto.randomUUID()
          await putAttachment({ id, blob: preview.image, type: preview.image.type })
          card.thumbnail = id
        }
        full = cardBlock(card)
      } else {
        if (!preview.title) return
        full = `[${linkText(preview.title)}](${target})`
      }
      replacePlaceholder(view, noteId, placeholder, full)
    })
    return true
  },
})

/**
 * 預覽抓回來時把佔位文字換掉。使用者已經改過那段（找不到原樣）就不動。
 * 編輯器已經關掉（換頁了）就直接改存好的筆記。
 */
function replacePlaceholder(view: EditorView, noteId: string | null, placeholder: string, full: string) {
  if (view.dom.isConnected) {
    const at = view.state.doc.toString().indexOf(placeholder)
    if (at < 0) return
    view.dispatch({ changes: { from: at, to: at + placeholder.length, insert: full } })
    return
  }
  if (!noteId) return
  const note = useNotes.getState().notes[noteId]
  if (!note || !note.body.includes(placeholder)) return
  useNotes.getState().updateNote(noteId, { body: note.body.replace(placeholder, full) })
}
