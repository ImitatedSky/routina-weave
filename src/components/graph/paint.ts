import type { GraphLink, GraphNode } from '@/notes/graphData'
import { rgba, type Palette } from './palette'

/** force-graph 會在節點上加座標，連線的兩端在載入後會換成節點物件 */
export type NodeObject = GraphNode & { x?: number; y?: number }
export type LinkObject = Omit<GraphLink, 'source' | 'target'> & {
  source: string | NodeObject
  target: string | NodeObject
}

export interface PaintState {
  palette: Palette
  /** 小圖譜的中心（本頁），多畫一圈 */
  centerId: string | null
  /** 滑鼠停著或手指點選的節點 */
  activeId: string | null
  /** activeId 和它的鄰居 */
  highlight: Set<string> | null
  /** 搜尋符合的節點 */
  matches: Set<string> | null
}

/** 縮放超過這個倍率才畫所有標題，不然整片都是字 */
const LABEL_SCALE = 1.1
/** 手指點得到的最小半徑（螢幕像素） */
const TOUCH_RADIUS = 14

export function nodeRadius(node: GraphNode): number {
  return node.kind === 'note' ? 4 + Math.sqrt(node.degree) * 2 : 3 + Math.sqrt(node.degree)
}

function endId(end: string | NodeObject): string {
  return typeof end === 'string' ? end : end.id
}

function isDimmed(id: string, s: PaintState): boolean {
  if (s.highlight) return !s.highlight.has(id)
  if (s.matches) return !s.matches.has(id)
  return false
}

function showsLabel(id: string, scale: number, s: PaintState): boolean {
  return scale >= LABEL_SCALE || id === s.centerId || !!s.highlight?.has(id) || !!s.matches?.has(id)
}

function truncate(text: string, max: number): string {
  const chars = [...text]
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : text
}

export function paintNode(node: NodeObject, ctx: CanvasRenderingContext2D, scale: number, s: PaintState) {
  const x = node.x ?? 0
  const y = node.y ?? 0
  const r = nodeRadius(node)
  const p = s.palette
  const color = node.kind === 'missing' || node.degree === 0 ? p.muted : p.primary
  ctx.globalAlpha = isDimmed(node.id, s) ? 0.15 : 1

  ctx.beginPath()
  ctx.arc(x, y, r, 0, 2 * Math.PI)
  if (node.kind === 'missing') {
    ctx.fillStyle = rgba(p.background)
    ctx.fill()
    ctx.setLineDash([2 / scale, 2 / scale])
    ctx.lineWidth = 1.2 / scale
    ctx.strokeStyle = rgba(color)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (r * scale < 6) {
    // 縮得很小時圖示看不清楚，只畫實心點
    ctx.fillStyle = rgba(color)
    ctx.fill()
  } else {
    // 先塗底色蓋住後面的線，再疊一層淡淡的主色
    ctx.fillStyle = rgba(p.background)
    ctx.fill()
    ctx.fillStyle = rgba(color, 0.18)
    ctx.fill()
    ctx.lineWidth = 1.5 / scale
    ctx.strokeStyle = rgba(color)
    ctx.stroke()
    ctx.font = `${r * 1.1}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = rgba(color)
    ctx.fillText(node.kind === 'tag' ? '#' : node.icon ?? '📄', x, y + r * 0.05)
  }

  if (node.id === s.centerId) {
    ctx.beginPath()
    ctx.arc(x, y, r + 3 / scale, 0, 2 * Math.PI)
    ctx.lineWidth = 2 / scale
    ctx.strokeStyle = rgba(p.primary)
    ctx.stroke()
  }

  if (showsLabel(node.id, scale, s)) {
    const text = node.kind === 'tag' ? `#${node.label}` : truncate(node.label, 18)
    const top = y + r + 3 / scale
    ctx.font = `${12 / scale}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    // 字的外圍描一圈底色，壓在線上也讀得到
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3 / scale
    ctx.strokeStyle = rgba(p.background)
    ctx.strokeText(text, x, top)
    ctx.fillStyle = rgba(node.kind === 'missing' ? p.muted : p.foreground)
    ctx.fillText(text, x, top)
  }
  ctx.globalAlpha = 1
}

/** 點擊判定的範圍：比畫出來的圓大，手指才點得到小節點 */
export function paintHitArea(node: NodeObject, color: string, ctx: CanvasRenderingContext2D, scale: number) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(node.x ?? 0, node.y ?? 0, Math.max(nodeRadius(node), TOUCH_RADIUS / scale), 0, 2 * Math.PI)
  ctx.fill()
}

function isActiveLink(link: LinkObject, s: PaintState): boolean {
  return !!s.activeId && (endId(link.source) === s.activeId || endId(link.target) === s.activeId)
}

export function linkColor(link: LinkObject, s: PaintState): string {
  const p = s.palette
  if (isActiveLink(link, s)) return rgba(p.primary, 0.9)
  // 有焦點或在搜尋時，其他線退到背景
  if (s.highlight || s.matches) return rgba(p.border)
  if (link.kind === 'link') return rgba(p.muted, 0.5)
  if (link.kind === 'tag') return rgba(p.primary, 0.3)
  return rgba(p.muted, 0.25)
}

export function linkWidth(link: LinkObject, s: PaintState): number {
  return isActiveLink(link, s) ? 2 : 1
}

export function linkDash(link: LinkObject): number[] | null {
  return link.kind === 'missing' ? [2, 2] : null
}
