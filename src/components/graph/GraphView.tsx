import { useMemo, useState } from 'react'
import { useNotes } from '@/store/notes'
import { buildGraphData, type GraphOptions } from '@/notes/graphData'
import { cn } from '@/lib/utils'
import { GraphCanvas } from './GraphCanvas'
import { useOpenGraphNode } from './useOpenGraphNode'

const TOGGLES: { key: keyof GraphOptions; label: string }[] = [
  { key: 'tags', label: '#標籤' },
  { key: 'missing', label: '未建立' },
  { key: 'children', label: '子頁面' },
]

/** 全頁圖譜：填滿 TopBar 以下的高度，頁面本身不捲動 */
export function GraphView() {
  const notes = useNotes((s) => s.notes)
  const openNode = useOpenGraphNode()
  const [options, setOptions] = useState<GraphOptions>({ tags: false, missing: false, children: true })
  const [query, setQuery] = useState('')
  const data = useMemo(() => buildGraphData(Object.values(notes), options), [notes, options])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋節點"
          aria-label="搜尋節點"
          className="h-8 min-w-32 flex-1 rounded-lg border bg-transparent px-3 text-sm outline-none focus:border-ring pointer-coarse:h-10"
        />
        {TOGGLES.map(({ key, label }) => (
          <button
            key={key}
            aria-pressed={options[key]}
            onClick={() => setOptions({ ...options, [key]: !options[key] })}
            className={cn(
              'h-8 rounded-lg border px-2.5 text-sm text-muted-foreground pointer-coarse:h-10',
              options[key] && 'border-transparent bg-accent text-accent-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {data.nodes.length ? (
        <GraphCanvas data={data} query={query} onOpen={openNode} className="min-h-0 flex-1" />
      ) : (
        <p className="p-8 text-muted-foreground">還沒有筆記。</p>
      )}
    </div>
  )
}
