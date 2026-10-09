import { useMemo } from 'react'
import { FilePlus, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotes } from '@/store/notes'
import { navigate } from '@/store/route'
import { useUi } from '@/store/ui'
import { NoteRow } from './NoteRow'

export function HomeView() {
  const notes = useNotes((s) => s.notes)
  const createNote = useNotes((s) => s.createNote)
  const openBookmark = useUi((s) => s.openBookmark)
  const recent = useMemo(
    () => Object.values(notes).filter((n) => !n.template).sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 15),
    [notes],
  )
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-24 sm:px-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="size-8 rounded-lg" />
        Weave
      </h1>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => navigate({ kind: 'page', id: createNote({ parent: null }).id })}>
          <FilePlus />
          新增頁面
        </Button>
        <Button variant="outline" onClick={() => openBookmark(null)}>
          <Link2 />
          新增網址
        </Button>
      </div>
      <h2 className="mt-8 mb-2 text-sm font-medium text-muted-foreground">最近編輯</h2>
      <div className="-mx-2">
        {recent.map((n) => <NoteRow key={n.id} note={n} />)}
      </div>
    </div>
  )
}
