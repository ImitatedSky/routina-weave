/**
 * 內文裡上傳的圖片。用標準 Markdown 圖片語法，路徑指向匯出 zip 時附件的位置：
 *   ![說明](_attachments/<附件 id>.jpg)
 * 匯出後在 Obsidian 也看得到（它會從 vault 根目錄找這個路徑）。
 * 上傳時一律縮成 JPEG（見 lib/resizeImage.ts），所以副檔名固定是 .jpg。
 */
const ATTACHMENT_SRC = /^(?:\.\.?\/)*_attachments\/([\w-]+)\.\w+$/

export function attachmentImageSrc(id: string): string {
  return `_attachments/${id}.jpg`
}

/** 圖片路徑是本機附件就回傳附件 id，網址或其他路徑回傳 undefined */
export function attachmentIdFromSrc(src: string): string | undefined {
  return ATTACHMENT_SRC.exec(src.trim())?.[1]
}

/** 內文裡所有上傳圖片的附件 id（刪筆記時判斷附件還有沒有人在用） */
export function bodyImageAttachments(body: string): string[] {
  const ids: string[] = []
  for (const m of body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const id = attachmentIdFromSrc(m[1])
    if (id) ids.push(id)
  }
  return ids
}
