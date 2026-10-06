import { useEffect, useState } from 'react'
import { getAttachment } from '@/storage/db'

/** 附件 id → object URL。元件卸載或 id 改變時釋放 */
export function useAttachmentUrl(id: string | undefined): string | undefined {
  // 記住 URL 是哪個 id 的，id 一換掉就不會短暫顯示上一張圖
  const [loaded, setLoaded] = useState<{ id: string; url: string }>()
  useEffect(() => {
    if (!id) return
    let objectUrl: string | undefined
    let cancelled = false
    void getAttachment(id).then((a) => {
      if (cancelled || !a) return
      objectUrl = URL.createObjectURL(a.blob)
      setLoaded({ id, url: objectUrl })
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])
  return loaded && loaded.id === id ? loaded.url : undefined
}
