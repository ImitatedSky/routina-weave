import { lazy, Suspense, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// 圖譜套件（force-graph＋d3）只有打開圖譜時才下載，App 啟動不用載入它
const GraphCanvas = lazy(() => import('./GraphCanvas').then((m) => ({ default: m.GraphCanvas })))

export function LazyGraphCanvas(props: ComponentProps<typeof GraphCanvas>) {
  return (
    <Suspense fallback={<div className={cn('flex items-center justify-center text-sm text-muted-foreground', props.className)}>載入圖譜…</div>}>
      <GraphCanvas {...props} />
    </Suspense>
  )
}
