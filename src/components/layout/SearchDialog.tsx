import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useNotes, pathOf } from '@/store/notes'
import { navigate } from '@/store/route'
import { useUi } from '@/store/ui'
import { NoteIcon } from '@/components/common/Thumbnail'
import { cn } from '@/lib/utils'
import type { Note } from '@/notes/types'

interface Hit {
  note: Note
  score: number
  snippet?: string
}

/** 標題命中排前面，其次是網址與內文。關鍵字用空白分開，全部都要出現 */
function search(notes: Note[], query: string): Hit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) {
    return [...notes].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 12).map((note) => ({ note, score: 0 }))
  }
  const hits: Hit[] = []
  for (const note of notes) {
    const title = note.title.toLowerCase()
    const haystack = `${title}\n${note.url ?? ''}\n${note.description ?? ''}\n${note.body.toLowerCase()}`
    if (!words.every((w) => haystack.includes(w))) continue
    let score = 0
    for (const w of words) {
      if (title.startsWith(w)) score += 3
      else if (title.includes(w)) score += 2
    }
    let snippet: string | undefined
    const at = note.body.toLowerCase().indexOf(words[0])
    if (at >= 0 && !title.includes(words[0])) {
      snippet = note.body.slice(Math.max(0, at - 20), at + 60).replace(/\s+/g, ' ')
    }
    hits.push({ note, score, snippet })
  }
  return hits.sort((a, b) => b.score - a.score || b.note.updated.localeCompare(a.note.updated)).slice(0, 30)
}

export function SearchDialog() {
  const open = useUi((s) => s.searchOpen)
  const setOpen = useUi((s) => s.setSearchOpen)
  const notes = useNotes((s) => s.notes)
  const createNote = useNotes((s) => s.createNote)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const hits = useMemo(() => search(Object.values(notes), query), [notes, query])
  const canCreate = query.trim() && !hits.some((h) => h.note.title.toLowerCase() === query.trim().toLowerCase())
  const total = hits.length + (canCreate ? 1 : 0)

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }
  const choose = (index: number) => {
    if (index < hits.length) {
      navigate({ kind: 'page', id: hits[index].note.id })
    } else if (canCreate) {
      const note = createNote({ title: query.trim(), parent: null })
      navigate({ kind: 'page', id: note.id })
    }
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent showCloseButton={false} className="top-[12%] translate-y-0 gap-0 p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">搜尋</DialogTitle>
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, total - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(active)
            }
          }}
          placeholder="搜尋筆記，或輸入新頁面的標題"
          className="h-12 w-full border-b bg-transparent px-4 text-base outline-none"
        />
        <div className="max-h-[60vh] overflow-y-auto p-1">
          {hits.map((hit, i) => (
            <button
              key={hit.note.id}
              onClick={() => choose(i)}
              onMouseMove={() => setActive(i)}
              className={cn('flex w-full items-start gap-2 rounded-md px-3 py-2 text-left', i === active && 'bg-muted')}
            >
              <NoteIcon note={hit.note} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{hit.note.title || '未命名'}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {hit.snippet ?? pathOf(notes, hit.note.id).slice(0, -1).map((p) => p.title).join(' / ')}
                </span>
              </span>
              {hit.note.template && <span className="text-xs text-muted-foreground">範本</span>}
            </button>
          ))}
          {canCreate && (
            <button
              onClick={() => choose(hits.length)}
              onMouseMove={() => setActive(hits.length)}
              className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm', active === hits.length && 'bg-muted')}
            >
              <Plus className="size-4" />
              建立「{query.trim()}」
            </button>
          )}
          {total === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">找不到</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
