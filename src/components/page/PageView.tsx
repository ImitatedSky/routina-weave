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
import { AddCoverButton, CoverPicker, PageCover } from './PageCover'
import { useOpenLink } from './useOpenLink'
import { Thumbnail } from '@/components/common/Thumbnail'
import type { Note } from '@/notes/types'
import { cn } from '@/lib/utils'

export function PageView({ note }: { note: Note }) {
  const mode = useUi((s) => s.mode)
  const updateNote = useNotes((s) => s.updateNote)
  const openLink = useOpenLink()
  const [pickingCover, setPickingCover] = useState(false)

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
    <>
      <PageCover note={note} onPick={() => setPickingCover(true)} />
      <CoverPicker note={note} open={pickingCover} onOpenChange={setPickingCover} />
      <article className={cn('mx-auto w-full max-w-3xl px-4 pb-24 sm:px-8', note.cover ? 'pt-0' : 'pt-6 sm:pt-10')}>
        {note.template && (
          <div className={cn('mb-4 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground', note.cover && 'mt-4')}>
            這是範本。可以用 <code>{'{{title}}'}</code>、<code>{'{{date}}'}</code>、<code>{'{{time}}'}</code>，新增頁面時會換成實際的值。
          </div>
        )}

        {/* 有封面時圖示往上疊在封面下緣，像 Notion */}
        {/* 這一列疊到封面上時是透明的，不能擋住封面右下角的「⋯」，所以只讓圖示和按鈕接收點擊 */}
        <div className={cn('pointer-events-none relative z-10 mb-2 flex items-end gap-1 *:pointer-events-auto', note.cover && !note.template && '-mt-7 sm:-mt-9')}>
          <div className={cn(note.cover && 'rounded-xl bg-background p-1')}>
            <IconPicker value={note.icon} onChange={(icon) => updateNote(note.id, { icon })} />
          </div>
          {!note.cover && <AddCoverButton onPick={() => setPickingCover(true)} />}
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
    </>
  )
}

/**
 * 標題在離開欄位或按 Enter 時才寫回。改標題會連帶改掉其他筆記裡的 [[連結]]，
 * 如果每打一個字就改，打到一半的標題可能剛好撞上別的筆記，把不相干的連結也改走。
 */
function TitleInput({ note }: { note: Note }) {
  const updateNote = useNotes((s) => s.updateNote)
  // 只有正在編輯時才有草稿；沒在編輯就直接顯示 note.title，
  // 背景抓回來的網址標題才不會被輸入框裡的舊值蓋掉
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const next = draft.trim() || '未命名'
    if (next !== note.title) updateNote(note.id, { title: next })
    setDraft(null)
  }
  // 換頁時元件卸載，還沒離開欄位的標題也要寫回
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })
  useEffect(() => () => commitRef.current(), [])

  return (
    <textarea
      rows={1}
      value={draft ?? note.title}
      onFocus={() => setDraft(note.title)}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLTextAreaElement).blur()
        }
      }}
      placeholder="未命名"
      aria-label="標題"
      className="w-full resize-none bg-transparent text-3xl leading-tight font-bold tracking-tight outline-none [field-sizing:content] placeholder:text-muted-foreground/50"
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
