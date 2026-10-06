import { useAttachmentUrl } from './useAttachmentUrl'
import { cn } from '@/lib/utils'
import type { Note } from '@/notes/types'

/** 筆記的縮圖：有圖用圖，沒圖退回圖示，再退回網域首字 */
export function Thumbnail({ note, className }: { note: Note; className?: string }) {
  const url = useAttachmentUrl(note.image)
  if (url) {
    return <img src={url} alt="" className={cn('shrink-0 rounded-md object-cover bg-muted', className)} />
  }
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground', className)}>
      <span className="text-lg leading-none">{note.icon ?? (note.site ?? note.title).slice(0, 1).toUpperCase()}</span>
    </div>
  )
}

/** 圖示：沒設就用預設的頁面符號 */
export function NoteIcon({ note, className }: { note: Note; className?: string }) {
  return <span className={cn('inline-block w-5 shrink-0 text-center leading-none', className)}>{note.icon ?? (note.url ? '🔗' : '📄')}</span>
}
