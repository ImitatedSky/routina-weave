import { useMemo } from 'react'
import { useNotes } from '@/store/notes'
import { allTags } from '@/notes/markdown'
import { NoteRow } from './NoteRow'

export function TagView({ tag }: { tag: string }) {
  const notes = useNotes((s) => s.notes)
  const list = useMemo(
    () => Object.values(notes).filter((n) => !n.template && allTags(n).includes(tag)).sort((a, b) => b.updated.localeCompare(a.updated)),
    [notes, tag],
  )
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-24 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">#{tag}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{list.length} 則筆記</p>
      <div className="-mx-2 mt-4">
        {list.map((n) => <NoteRow key={n.id} note={n} />)}
      </div>
    </div>
  )
}
