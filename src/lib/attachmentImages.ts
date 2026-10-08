import { getAttachment } from '@/storage/db'

/**
 * 把 root 裡 <img data-attachment="id"> 的圖從 IndexedDB 讀出來補上。
 * 回傳的函式釋放這次建立的 object URL（元件卸載或內容換掉時呼叫）。
 */
export function fillAttachmentImages(root: HTMLElement): () => void {
  const urls: string[] = []
  let cancelled = false
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-attachment]')) {
    const id = img.dataset.attachment!
    void getAttachment(id).then((a) => {
      if (cancelled) return
      if (!a) {
        // 附件不見了（例如只匯入了 .md）：把縮圖框藏起來，卡片只留文字
        img.closest<HTMLElement>('.link-card-thumb')?.remove()
        return
      }
      const url = URL.createObjectURL(a.blob)
      urls.push(url)
      img.src = url
    })
  }
  return () => {
    cancelled = true
    for (const url of urls) URL.revokeObjectURL(url)
  }
}
