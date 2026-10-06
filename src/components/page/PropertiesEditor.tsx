import type { Note } from '@/notes/types'

// TODO(資料庫 agent)：屬性編輯器
export function PropertiesEditor({ note }: { note: Note }) {
  const entries = Object.entries(note.props)
  if (!entries.length) return null
  return (
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{String(v)}</dd>
        </div>
      ))}
    </dl>
  )
}
