import { navigate } from '@/store/route'
import { NoteIcon, Thumbnail } from '@/components/common/Thumbnail'
import { formatValue, type Field } from '@/notes/database'
import type { Note } from '@/notes/types'

/** 前幾個欄位裡有值的，做成小標籤。勾選欄位顯示「✓ 欄位名」比只有勾號好懂 */
export function PropChips({ note, fields, limit = 2 }: { note: Note; fields: Field[]; limit?: number }) {
  const chips: { key: string; text: string }[] = []
  for (const field of fields) {
    if (chips.length >= limit) break
    const value = note.props[field.key]
    const text = formatValue(field.key, value)
    if (!text) continue
    chips.push({ key: field.key, text: typeof value === 'boolean' ? `✓ ${field.key}` : text })
  }
  if (!chips.length) return null
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.key} title={c.key} className="max-w-40 truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {c.text}
        </span>
      ))}
    </span>
  )
}

export function ListView({ items, fields }: { items: Note[]; fields: Field[] }) {
  return (
    <div className="-mx-2">
      {items.map((n) => (
        <button
          key={n.id}
          onClick={() => navigate({ kind: 'page', id: n.id })}
          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
        >
          {n.url ? <Thumbnail note={n} className="size-8" /> : <NoteIcon note={n} className="w-8 text-lg" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{n.title || '未命名'}</span>
            {n.url && !Object.keys(n.props).length && (
              <span className="block truncate text-xs text-muted-foreground">{n.site ?? n.url}</span>
            )}
          </span>
          <span className="max-w-[45%] shrink-0">
            <PropChips note={n} fields={fields} />
          </span>
        </button>
      ))}
    </div>
  )
}
