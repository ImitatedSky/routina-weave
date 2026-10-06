import { useNotes, childrenOf } from '@/store/notes'
import { navigate } from '@/store/route'
import type { Note } from '@/notes/types'

// TODO(資料庫 agent)：清單／表格／卡片視圖
export function ChildPages({ note }: { note: Note }) {
  const notes = useNotes((s) => s.notes)
  const children = childrenOf(notes, note.id)
  if (!children.length) return null
  return (
    <section className="mt-10">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">子頁面</h2>
      {children.map((c) => (
        <button key={c.id} className="block py-1" onClick={() => navigate({ kind: 'page', id: c.id })}>
          {c.icon} {c.title}
        </button>
      ))}
    </section>
  )
}
