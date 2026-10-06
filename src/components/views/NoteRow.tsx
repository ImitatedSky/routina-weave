import { navigate } from '@/store/route'
import { useNotes, pathOf } from '@/store/notes'
import { NoteIcon, Thumbnail } from '@/components/common/Thumbnail'
import type { Note } from '@/notes/types'

/** 精簡列表的一列：網址筆記顯示小縮圖＋網域，其他顯示圖示＋所在位置 */
export function NoteRow({ note }: { note: Note }) {
  const notes = useNotes((s) => s.notes)
  const where = pathOf(notes, note.id).slice(0, -1).map((p) => p.title).join(' / ')
  return (
    <button
      onClick={() => navigate({ kind: 'page', id: note.id })}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
    >
      {note.url ? <Thumbnail note={note} className="size-10" /> : <NoteIcon note={note} className="w-10 text-xl" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{note.title || '未命名'}</span>
        <span className="block truncate text-xs text-muted-foreground">{note.url ? note.site ?? note.url : where || '最上層'}</span>
      </span>
    </button>
  )
}
