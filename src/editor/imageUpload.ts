import { EditorView } from '@codemirror/view'
import { toast } from 'sonner'
import { resizeImage } from '@/lib/resizeImage'
import { putAttachment } from '@/storage/db'
import { attachmentImageSrc } from '@/notes/images'
import { inCode } from './syntax'

/**
 * 內文插入上傳的圖片：縮成 JPEG 存成附件，在游標處放 ![](_attachments/<id>.jpg)，自成一行。
 * 從 / 選單「上傳圖片」或直接貼上剪貼簿裡的圖片都走這裡。
 */
export async function insertImageFile(view: EditorView, file: Blob) {
  let id: string
  try {
    const blob = await resizeImage(file)
    id = crypto.randomUUID()
    await putAttachment({ id, blob, type: blob.type })
  } catch {
    toast.error('這張圖片讀不進來，換一張試試')
    return
  }
  if (!view.dom.isConnected) return
  const { state } = view
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  const image = `![](${attachmentImageSrc(id)})`
  const before = line.text.slice(0, head - line.from).trim() ? '\n' : ''
  const insert = `${before}${image}\n`
  view.dispatch({
    changes: { from: head, insert },
    selection: { anchor: head + insert.length },
    userEvent: 'input',
    scrollIntoView: true,
  })
}

/** 打開系統的選圖畫面（Android 殼會轉給檔案選擇器），選好就插入 */
export function pickImage(view: EditorView) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.hidden = true
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.remove()
    if (file) void insertImageFile(view, file)
  })
  // 使用者按取消也要收掉
  input.addEventListener('cancel', () => input.remove())
  // 有些瀏覽器（含部分 WebView）不理會沒放進頁面的 <input> 的 click
  document.body.appendChild(input)
  input.click()
}

/** 貼上剪貼簿裡的圖片（例如截圖） */
export const pasteImage = EditorView.domEventHandlers({
  paste(event, view) {
    const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (!file || inCode(view.state, view.state.selection.main.head)) return false
    event.preventDefault()
    void insertImageFile(view, file)
    return true
  },
})
