import { navigate } from '@/store/route'
import { NoteIcon, Thumbnail } from '@/components/common/Thumbnail'
import { CoverImage } from '@/components/common/CoverImage'
import { formatValue, type Field } from '@/notes/database'
import type { Note } from '@/notes/types'

/** 卡片視圖：上方是封面，沒有封面用網址縮圖，再沒有就放大圖示；下方標題＋前兩個有值的屬性 */
export function GalleryView({ items, fields }: { items: Note[]; fields: Field[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((n) => (
        <button
          key={n.id}
          onClick={() => navigate({ kind: 'page', id: n.id })}
          className="flex flex-col overflow-hidden rounded-xl border bg-card text-left hover:bg-muted/50"
        >
          {n.cover ? (
            <CoverImage cover={n.cover} y={n.coverY} className="block aspect-[1.91] w-full" />
          ) : n.image ? (
            <Thumbnail note={n} className="aspect-[1.91] w-full rounded-none" />
          ) : (
            <div className="flex aspect-[1.91] w-full items-center justify-center bg-muted">
              <NoteIcon note={n} className="w-auto text-4xl" />
            </div>
          )}
          <div className="grid gap-0.5 p-2">
            <div className="line-clamp-2 text-sm font-medium">
              {/* 上方已經是封面或縮圖時，圖示改放在標題前面 */}
              {(n.cover || n.image) && n.icon && <span className="mr-1">{n.icon}</span>}
              {n.title || '未命名'}
            </div>
            <CardProps note={n} fields={fields} />
          </div>
        </button>
      ))}
    </div>
  )
}

function CardProps({ note, fields }: { note: Note; fields: Field[] }) {
  const lines: { key: string; text: string }[] = []
  for (const field of fields) {
    if (lines.length >= 2) break
    const text = formatValue(field.key, note.props[field.key])
    if (text) lines.push({ key: field.key, text })
  }
  if (!lines.length) {
    return note.site ? <div className="truncate text-xs text-muted-foreground">{note.site}</div> : null
  }
  return (
    <>
      {lines.map((l) => (
        <div key={l.key} className="flex min-w-0 gap-1 text-xs">
          <span className="shrink-0 text-muted-foreground">{l.key}</span>
          <span className="truncate">{l.text}</span>
        </div>
      ))}
    </>
  )
}
