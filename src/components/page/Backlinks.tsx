import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotes, childrenOf } from '@/store/notes'
import { navigate } from '@/store/route'
import { NoteIcon } from '@/components/common/Thumbnail'
import { LazyGraphCanvas as GraphCanvas } from '@/components/graph/LazyGraphCanvas'
import { useOpenGraphNode } from '@/components/graph/useOpenGraphNode'
import { buildLinkGraph } from '@/notes/links'
import { buildGraphData, localGraph } from '@/notes/graphData'
import { findLinkMention, noteUnlinkedMention, snippetAt, linkMention, type Snippet } from '@/notes/mentions'
import { cn } from '@/lib/utils'
import type { Note } from '@/notes/types'

interface Mentioned {
  note: Note
  snippet: Snippet | null
}

/** 頁面底部：連到這頁的筆記、未連結的提及、本頁的小圖譜 */
export function Backlinks({ note }: { note: Note }) {
  const notes = useNotes((s) => s.notes)
  const updateNote = useNotes((s) => s.updateNote)

  const { linked, unlinked, hasGraph } = useMemo(() => {
    const list = Object.values(notes)
    const graph = buildLinkGraph(list)
    const incoming = graph.incoming.get(note.id) ?? new Set<string>()
    const byUpdated = (a: Mentioned, b: Mentioned) => b.note.updated.localeCompare(a.note.updated)

    const linked: Mentioned[] = [...incoming]
      .map((id) => notes[id])
      .filter(Boolean)
      .map((n) => {
        const mention = findLinkMention(n.body, note.title)
        return { note: n, snippet: mention ? snippetAt(n.body, mention) : null }
      })
      .sort(byUpdated)

    const unlinked: Mentioned[] = []
    for (const n of list) {
      if (n.id === note.id || n.template || incoming.has(n.id)) continue
      const mention = noteUnlinkedMention(n, note.title)
      if (mention) unlinked.push({ note: n, snippet: snippetAt(n.body, mention) })
    }
    unlinked.sort(byUpdated)

    // 小圖譜要展開才算；這裡只判斷有沒有東西可以畫（有連出、連入、上層或子頁面）
    const hasGraph =
      incoming.size > 0 || (graph.outgoing.get(note.id)?.size ?? 0) > 0 || !!note.parent || childrenOf(notes, note.id).length > 0
    return { linked, unlinked, hasGraph }
  }, [notes, note.id, note.title, note.parent])

  if (!linked.length && !unlinked.length) {
    return (
      <section className="mt-10 border-t pt-4">
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="flex-1 text-sm text-muted-foreground/70">還沒有其他筆記連到這裡</p>
          {hasGraph && <LocalGraph centerId={note.id} compact />}
        </div>
      </section>
    )
  }

  return (
    <section className="mt-10 border-t pt-6">
      <h2 className="mb-1 text-sm font-medium text-muted-foreground">
        連到這頁的筆記 <span className="text-muted-foreground/70">{linked.length}</span>
      </h2>
      {linked.length ? (
        <div className="-mx-2">
          {linked.map((m) => <MentionRow key={m.note.id} mentioned={m} />)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/70">還沒有其他筆記連到這裡</p>
      )}

      {unlinked.length > 0 && (
        <>
          <h2 className="mt-6 mb-1 text-sm font-medium text-muted-foreground">
            未連結的提及 <span className="text-muted-foreground/70">{unlinked.length}</span>
          </h2>
          <div className="-mx-2">
            {unlinked.map((m) => (
              <div key={m.note.id} className="flex items-center gap-1">
                <MentionRow mentioned={m} />
                <Button
                  variant="outline"
                  size="sm"
                  className="mr-2"
                  onClick={() => updateNote(m.note.id, { body: linkMention(m.note.body, note.title) })}
                >
                  連結
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {hasGraph && <LocalGraph centerId={note.id} />}
    </section>
  )
}

function MentionRow({ mentioned: { note, snippet } }: { mentioned: Mentioned }) {
  return (
    <button
      onClick={() => navigate({ kind: 'page', id: note.id })}
      className="flex min-h-10 w-full min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
    >
      <NoteIcon note={note} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{note.title || '未命名'}</span>
        {snippet && (
          <span className="line-clamp-2 text-xs break-all text-muted-foreground">
            {snippet.before}
            <mark className="rounded bg-accent px-0.5 text-accent-foreground">{snippet.match}</mark>
            {snippet.after}
          </span>
        )}
      </span>
    </button>
  )
}

/** 預設收合；compact 是沒有反向連結時跟提示擠在同一行的小按鈕 */
function LocalGraph({ centerId, compact }: { centerId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const toggle = (
    <button
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className={cn(
        'flex items-center gap-1 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted pointer-coarse:min-h-10',
        compact ? 'px-2 py-1' : '-mx-2 mt-6 px-2 py-1',
      )}
    >
      <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
      本頁的小圖譜
    </button>
  )
  if (!open) return toggle
  return <OpenLocalGraph toggle={toggle} centerId={centerId} compact={compact} />
}

/** 展開後才掛上，收合時完全不算圖譜資料 */
function OpenLocalGraph({ toggle, centerId, compact }: { toggle: React.ReactNode; centerId: string; compact?: boolean }) {
  const notes = useNotes((s) => s.notes)
  const openNode = useOpenGraphNode()
  const data = useMemo(
    () => localGraph(buildGraphData(Object.values(notes), { tags: false, missing: false, children: true }), centerId, 2),
    [notes, centerId],
  )
  return (
    <>
      {toggle}
      {/* compact 模式時按鈕在同一行裡，圖要換到下一行 */}
      <GraphCanvas
        data={data}
        centerId={centerId}
        onOpen={openNode}
        className={cn('mt-2 h-[260px] rounded-xl border', compact && 'basis-full')}
      />
    </>
  )
}
