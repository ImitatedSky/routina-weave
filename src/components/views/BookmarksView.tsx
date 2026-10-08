import { useMemo, useState } from 'react'
import { LayoutGrid, List, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotes } from '@/store/notes'
import { useUi } from '@/store/ui'
import { navigate } from '@/store/route'
import { Thumbnail } from '@/components/common/Thumbnail'
import { CoverImage } from '@/components/common/CoverImage'
import { NoteRow } from './NoteRow'
import { cn } from '@/lib/utils'

/** 所有網址筆記，不管放在哪一頁底下。預設精簡清單，收藏多了也不亂 */
export function BookmarksView() {
  const notes = useNotes((s) => s.notes)
  const openBookmark = useUi((s) => s.openBookmark)
  const [layout, setLayout] = useState<'list' | 'grid'>('list')
  const [query, setQuery] = useState('')
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.values(notes)
      .filter((n) => n.url && !n.template)
      .filter((n) => !q || `${n.title} ${n.site ?? ''} ${n.description ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.created.localeCompare(a.created))
  }, [notes, query])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-24 sm:px-8">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-bold tracking-tight">網址</h1>
        <div className="flex rounded-lg border p-0.5">
          {(['list', 'grid'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              aria-label={l === 'list' ? '清單' : '卡片'}
              className={cn('rounded-md p-1.5 text-muted-foreground pointer-coarse:p-2.5', layout === l && 'bg-muted text-foreground')}
            >
              {l === 'list' ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
            </button>
          ))}
        </div>
        <Button onClick={() => openBookmark(null)}>
          <Plus />
          新增
        </Button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`在 ${list.length} 個網址中篩選`}
        className="mt-4 h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus:border-ring"
      />
      {layout === 'list' ? (
        <div className="-mx-2 mt-2">{list.map((n) => <NoteRow key={n.id} note={n} />)}</div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate({ kind: 'page', id: n.id })}
              className="overflow-hidden rounded-xl border bg-card text-left hover:bg-muted/50"
            >
              {n.cover ? (
                <CoverImage cover={n.cover} y={n.coverY} className="block aspect-[1.91] w-full" />
              ) : (
                <Thumbnail note={n} className="aspect-[1.91] w-full rounded-none" />
              )}
              <div className="p-2">
                <div className="line-clamp-2 text-sm font-medium">{n.title}</div>
                <div className="truncate text-xs text-muted-foreground">{n.site}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
