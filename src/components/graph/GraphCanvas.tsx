import { useEffect, useRef, useState } from 'react'
import ForceGraph from 'force-graph'
import { Maximize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { neighborMap, type GraphData, type GraphNode } from '@/notes/graphData'
import { cn } from '@/lib/utils'
import { readPalette } from './palette'
import {
  linkColor, linkDash, linkWidth, paintHitArea, paintNode,
  type LinkObject, type NodeObject, type PaintState,
} from './paint'

type Graph = ForceGraph<NodeObject, LinkObject>

interface Props {
  data: GraphData
  onOpen: (node: GraphNode) => void
  /** 小圖譜的中心節點 */
  centerId?: string
  /** 篩選高亮的關鍵字 */
  query?: string
  className?: string
}

const OPEN_LABEL: Record<GraphNode['kind'], string> = { note: '開啟', tag: '查看', missing: '建立' }

/** zoomToFit 只看節點中心，留邊給標題和右上角的按鈕；小圖譜比較矮，按比例少留一點 */
function fit(graph: Graph, ms: number) {
  graph.zoomToFit(ms, Math.min(56, Math.min(graph.width(), graph.height()) * 0.16))
}

/** 重設任一個樣式屬性 force-graph 就會在下一格重畫；高亮、換色時用 */
function redraw(graph: Graph) {
  graph.linkColor(graph.linkColor())
}

function setActive(graph: Graph, view: PaintState, neighbors: Map<string, Set<string>>, id: string | null) {
  view.activeId = id
  view.highlight = id ? new Set([id, ...(neighbors.get(id) ?? [])]) : null
  redraw(graph)
}

/**
 * force-graph（canvas）包成元件，全頁圖譜與頁面底下的小圖譜共用。
 * 滑鼠：停著高亮、點了開啟。
 * 觸控：沒有 hover，第一次點只選取（高亮＋下方卡片），再點一次或按卡片的按鈕才開啟，避免誤觸跳頁。
 */
export function GraphCanvas({ data, onOpen, centerId, query = '', className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const viewRef = useRef<PaintState | null>(null)
  const neighborsRef = useRef(new Map<string, Set<string>>())
  const hoverRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const pointerTypeRef = useRef('mouse')
  const touchedRef = useRef(false)
  const signatureRef = useRef('')
  const onOpenRef = useRef(onOpen)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    onOpenRef.current = onOpen
  }, [onOpen])

  useEffect(() => {
    const wrap = wrapRef.current!
    const view: PaintState = { palette: readPalette(), centerId: null, activeId: null, highlight: null, matches: null }
    viewRef.current = view
    signatureRef.current = ''
    // 0：還沒對焦，1：第一格先對焦一次，2：排版穩定後再對焦，之後交給使用者
    let fitStage = 0

    const graph: Graph = new ForceGraph<NodeObject, LinkObject>(hostRef.current!)
      .width(wrap.clientWidth)
      .height(wrap.clientHeight)
      .nodeLabel(() => '')
      .nodeCanvasObject((node, ctx, scale) => paintNode(node, ctx, scale, view))
      .nodePointerAreaPaint(paintHitArea)
      .linkColor((link) => linkColor(link, view))
      .linkWidth((link) => linkWidth(link, view))
      .linkLineDash(linkDash)
      .minZoom(0.2)
      .maxZoom(6)
      .warmupTicks(80)
      .cooldownTime(3000)
      .onNodeHover((node) => {
        // 觸控時 force-graph 會把最後碰到的位置當成 hover，平移後會亂亮，所以只理滑鼠
        if (pointerTypeRef.current !== 'mouse') return
        hoverRef.current = node?.id ?? null
        setActive(graph, view, neighborsRef.current, hoverRef.current ?? selectedRef.current)
      })
      .onNodeClick((node, event) => {
        const touch = (event as PointerEvent).pointerType !== 'mouse'
        if (!touch || selectedRef.current === node.id) onOpenRef.current(node)
        else setSelectedId(node.id)
      })
      .onBackgroundClick(() => setSelectedId(null))
      .onEngineTick(() => {
        if (fitStage > 0 || !graph.graphData().nodes.length) return
        fitStage = 1
        fit(graph, 0)
      })
      .onEngineStop(() => {
        if (fitStage !== 1) return
        fitStage = 2
        if (!touchedRef.current) fit(graph, 400)
      })
    graph.d3Force('charge')?.strength(-120)
    graph.d3Force('link')?.distance(45)
    graphRef.current = graph

    const resize = new ResizeObserver(() => {
      if (wrap.clientWidth && wrap.clientHeight) graph.width(wrap.clientWidth).height(wrap.clientHeight)
    })
    resize.observe(wrap)

    // 深淺色切換是 html 上的 .dark
    const theme = new MutationObserver(() => {
      view.palette = readPalette()
      redraw(graph)
    })
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      resize.disconnect()
      theme.disconnect()
      graph._destructor()
      graphRef.current = null
    }
  }, [])

  useEffect(() => {
    const graph = graphRef.current
    const view = viewRef.current
    if (!graph || !view) return
    // 頁面打字時筆記一直存，資料內容沒變就不要重餵，不然整張圖會一直晃
    const signature = JSON.stringify(data)
    if (signature === signatureRef.current) return
    signatureRef.current = signature

    neighborsRef.current = neighborMap(data.links)
    // 沿用同 id 的舊節點物件，force-graph 才會保留原本的位置
    const old = new Map(graph.graphData().nodes.map((n) => [n.id, n]))
    const nodes = data.nodes.map((n) => Object.assign(old.get(n.id) ?? {}, n))
    const links = data.links.map((l) => ({ ...l }))
    graph.graphData({ nodes, links })
    setActive(graph, view, neighborsRef.current, hoverRef.current ?? selectedRef.current)
  }, [data])

  useEffect(() => {
    const graph = graphRef.current
    const view = viewRef.current
    if (!graph || !view) return
    const q = query.trim().toLowerCase()
    view.matches = q ? new Set(data.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id)) : null
    redraw(graph)
  }, [data, query])

  useEffect(() => {
    const graph = graphRef.current
    const view = viewRef.current
    if (!graph || !view) return
    view.centerId = centerId ?? null
    redraw(graph)
  }, [centerId])

  useEffect(() => {
    const graph = graphRef.current
    const view = viewRef.current
    selectedRef.current = selectedId
    if (graph && view) setActive(graph, view, neighborsRef.current, hoverRef.current ?? selectedId)
  }, [selectedId])

  const selected = selectedId ? data.nodes.find((n) => n.id === selectedId) : undefined

  return (
    <div
      ref={wrapRef}
      className={cn('relative overflow-hidden select-none', className)}
      onPointerDown={(e) => {
        pointerTypeRef.current = e.pointerType
        touchedRef.current = true
      }}
      onPointerLeave={(e) => {
        const graph = graphRef.current
        const view = viewRef.current
        if (e.pointerType !== 'mouse' || !graph || !view || !hoverRef.current) return
        hoverRef.current = null
        setActive(graph, view, neighborsRef.current, selectedRef.current)
      }}
    >
      <div ref={hostRef} className="absolute inset-0" />

      <Button
        variant="outline"
        size="icon-sm"
        className="absolute top-2 right-2 bg-background/80 backdrop-blur"
        aria-label="顯示全部"
        onClick={() => graphRef.current && fit(graphRef.current, 400)}
      >
        <Maximize2 />
      </Button>

      {selected && (
        <div className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-xl border bg-popover p-1.5 pl-3 text-popover-foreground shadow-md">
          <span className="w-5 shrink-0 text-center text-lg leading-none">
            {selected.kind === 'tag' ? '#' : selected.icon ?? '○'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{selected.label}</span>
            {selected.kind === 'missing' && <span className="block text-xs text-muted-foreground">還沒有這一頁</span>}
          </span>
          <Button size="sm" onClick={() => onOpen(selected)}>
            {OPEN_LABEL[selected.kind]}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="取消選取" onClick={() => setSelectedId(null)}>
            <X />
          </Button>
        </div>
      )}
    </div>
  )
}
