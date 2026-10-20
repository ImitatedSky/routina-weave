import { cardThumbnails } from './cardlink'
import { coverAttachment } from './covers'
import { bodyImageAttachments } from './images'
import type { Note } from './types'

/**
 * 這則筆記用到的附件：網址縮圖、封面圖片、內文連結卡片的縮圖、內文上傳的圖片。
 * 刪筆記時判斷附件還有沒有人在用，以及雲端同步決定哪些附件要傳，都用這一套規則。
 */
export function attachmentsOf(note: Note): string[] {
  const ids = [...cardThumbnails(note.body), ...bodyImageAttachments(note.body)]
  if (note.image) ids.push(note.image)
  const cover = coverAttachment(note.cover)
  if (cover) ids.push(cover)
  return ids
}
