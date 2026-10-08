import { useAttachmentUrl } from './useAttachmentUrl'
import { coverAttachment, presetCss } from '@/notes/covers'
import { cn } from '@/lib/utils'

/** 畫出封面：內建的是 CSS 背景，圖片從附件讀。y 是圖片的垂直位置（%）。頁面頂端與卡片視圖共用 */
export function CoverImage({ cover, y, className }: { cover: string; y?: number; className?: string }) {
  const url = useAttachmentUrl(coverAttachment(cover))
  const css = presetCss(cover)
  if (css) return <div className={cn('bg-muted', className)} style={{ background: css }} />
  return url ? (
    <img src={url} alt="" draggable={false} className={cn('bg-muted object-cover', className)} style={{ objectPosition: `50% ${y ?? 50}%` }} />
  ) : (
    <div className={cn('bg-muted', className)} />
  )
}
