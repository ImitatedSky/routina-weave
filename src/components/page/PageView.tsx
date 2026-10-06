import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useNotes } from '@/store/notes'
import { useUi } from '@/store/ui'
import { MarkdownEditor } from '@/editor/MarkdownEditor'
import { Preview } from './Preview'
import { IconPicker } from './IconPicker'
import { PropertiesEditor } from './PropertiesEditor'
import { ChildPages } from './ChildPages'
import { Backlinks } from './Backlinks'
import { useOpenLink } from './useOpenLink'
import { Thumbnail } from '@/components/common/Thumbnail'
import type { Note } from '@/notes/types'

export function PageView({ note }: { note: Note }) {
  const mode = useUi((s) => s.mode)
  const updateNote = useNotes((s) => s.updateNote)
  const openLink = useOpenLink()

  // 內文打字時不要每個字都寫 IndexedDB；換頁或離開時把最後一次送出去。
  // pending 記住是哪一頁的內容：換頁時 cleanup 跑在新頁面 render 之後，不能用當下的 note.id
  const pending = useRef<{ id: string; body: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const flush = () => {
    window.clearTimeout(timer.current)
    if (pending.current) {
      updateNote(pending.current.id, { body: pending.current.body })
      pending.current = null
    }
  }
  useEffect(() => () => flush(), [note.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // 切到預覽時要馬上看到剛打的字
  useEffect(() => flush(), [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const onBodyChange = (body: string) => {
    pending.current = { id: note.id, body }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 300)
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-4 pt-6 pb-24 sm:px-8 sm:pt-10">
      {note.template && (
        <div className="mb-4 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
          這是範本。可以用 <code>{'{{title}}'}</code>、<code>{'{{date}}'}</code>、<code>{'{{time}}'}</code>，新增頁面時會換成實際的值。
        </div>
      )}

      <div className="mb-2">
        <IconPicker value={note.icon} onChange={(icon) => updateNote(note.id, { icon })} />
      </div>
      <TitleInput key={note.id} note={note} />

      {note.url && <LinkCard note={note} />}

      <PropertiesEditor note={note} />

      <div className="mt-4">
        {mode === 'edit' ? (
          <MarkdownEditor key={note.id} value={note.body} onChange={onBodyChange} onOpenLink={openLink} />
        ) : (
          <Preview noteId={note.id} body={note.body} />
        )}
      </div>

      {!note.template && <ChildPages note={note} />}
      {!note.template && <Backlinks note={note} />}
    </article>
  )
}

/**
 * 標題在離開欄位或按 Enter 時才寫回。改標題會連帶改掉其他筆記裡的 [[連結]]，
 * 如果每打一個字就改，打到一半的標題可能剛好撞上別的筆記，把不相干的連結也改走。
 */
function TitleInput({ note }: { note: Note }) {
  const updateNote = useNotes((s) => s.updateNote)
  const [title, setTitle] = useState(note.title)
  const commit = () => {
    const next = title.trim() || '未命名'
    if (next !== note.title) updateNote(note.id, { title: next })
    if (next !== title) setTitle(next)
  }
  const commitRef = useRef(commit)
  commitRef.current = commit
  useEffect(() => () => commitRef.current(), [])

  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      placeholder="未命名"
      aria-label="標題"
      className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
    />
  )
}

function LinkCard({ note }: { note: Note }) {
  return (
    <a
      href={note.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 flex gap-3 rounded-xl border bg-card p-3 hover:bg-muted/50"
    >
      <Thumbnail note={note} className="size-16" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{note.title}</div>
        {note.description && <div className="line-clamp-2 text-xs text-muted-foreground">{note.description}</div>}
        <div className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <ExternalLink className="size-3 shrink-0" />
          <span className="truncate">{note.site ?? note.url}</span>
        </div>
      </div>
    </a>
  )
}
