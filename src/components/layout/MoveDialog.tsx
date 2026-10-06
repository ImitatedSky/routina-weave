import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useNotes, descendants, pathOf } from '@/store/notes'
import { NoteIcon } from '@/components/common/Thumbnail'

/** 選一個新的上層頁面。自己和自己的子頁面不能選 */
export function MoveDialog(props: { noteId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const notes = useNotes((s) => s.notes)
  const moveNote = useNotes((s) => s.moveNote)
  const [query, setQuery] = useState('')

  const candidates = useMemo(() => {
    const blocked = new Set([props.noteId, ...descendants(notes, props.noteId)])
    const q = query.trim().toLowerCase()
    return Object.values(notes)
      .filter((n) => !blocked.has(n.id) && !n.template)
      .filter((n) => !q || n.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 50)
  }, [notes, props.noteId, query])

  const move = (parent: string | null) => {
    if (moveNote(props.noteId, parent)) {
      toast.success(parent ? `已移到「${notes[parent].title}」底下` : '已移到最上層')
    }
    props.onOpenChange(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[80vh] grid-rows-[auto_auto_1fr]">
        <DialogHeader>
          <DialogTitle>移到…</DialogTitle>
        </DialogHeader>
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋頁面" />
        <div className="-mx-1 flex flex-col overflow-y-auto">
          <button className="rounded-md px-2 py-2 text-left hover:bg-muted" onClick={() => move(null)}>
            ⬆️ 最上層
          </button>
          {candidates.map((n) => (
            <button key={n.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted" onClick={() => move(n.id)}>
              <NoteIcon note={n} />
              <span className="min-w-0 flex-1 truncate">
                {pathOf(notes, n.id).map((p) => p.title).join(' / ')}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
