import type { Attachment } from '@/storage/db'

/**
 * 附件只收點陣圖。SVG 可以夾帶腳本，使用者「在新分頁開啟圖片」時會跟 App 同源執行，所以不收；
 * 其他不認得的一律存成 application/octet-stream，畫面上不顯示。
 * MIME type → 副檔名（匯出 zip、雲端同步的檔名都用這張表）。
 */
export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
}

export const UNKNOWN_TYPE = 'application/octet-stream'

export function isImageType(type: string): boolean {
  return Object.hasOwn(IMAGE_EXTENSIONS, type)
}

/** 副檔名 → MIME type，不在白名單裡的回傳 application/octet-stream */
export function imageTypeOfExtension(ext: string): string {
  const lower = ext.toLowerCase()
  if (lower === 'jpeg') return 'image/jpeg'
  return Object.keys(IMAGE_EXTENSIONS).find((type) => IMAGE_EXTENSIONS[type] === lower) ?? UNKNOWN_TYPE
}

/** 不在白名單裡的 type 換成 application/octet-stream */
export function safeImageType(type: string): string {
  return isImageType(type) ? type : UNKNOWN_TYPE
}

/** 存進本機前用：不是點陣圖的 type 換成 octet-stream，blob 本身的 type 也跟著改 */
export function safeAttachment(attachment: Attachment): Attachment {
  const type = safeImageType(attachment.type)
  const blob = attachment.blob.type === type ? attachment.blob : new Blob([attachment.blob], { type })
  return { ...attachment, type, blob }
}

/**
 * 附件 → object URL。舊資料裡的 SVG 之類不是點陣圖的不建，回傳 undefined。
 * blob 本身的 type 決定 blob: 網址的 Content-Type，跟 attachment.type 對不上就照白名單的重包一次
 */
export function attachmentObjectUrl(attachment: Attachment): string | undefined {
  const { type, blob } = attachment
  if (!isImageType(type)) return undefined
  return URL.createObjectURL(blob.type === type ? blob : new Blob([blob], { type }))
}
