import type { Note } from './types'
import { buildLinkGraph, normalizeTitle } from './links'
import { allTags } from './markdown'

/** 圖譜上的節點：筆記、#標籤、還沒建立的 [[連結]] */
export type GraphNodeKind = 'note' | 'tag' | 'missing'
export type GraphLinkKind = 'link' | 'child' | 'tag' | 'missing'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  /** 筆記標題、標籤名稱（不含 #）或未建立的標題 */
  label: string
  icon?: string
  /** 連線數（入＋出），決定節點大小 */
  degree: number
}

export interface GraphLink {
  source: string
  target: string
  kind: GraphLinkKind
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export interface GraphOptions {
  tags: boolean
  missing: boolean
  children: boolean
}

export function tagNodeId(tag: string): string {
  return `tag:${tag}`
}

export function missingNodeId(title: string): string {
  return `missing:${normalizeTitle(title)}`
}

/** 筆記 → 圖譜的節點與連線。範本不算。兩則筆記之間只畫一條線 */
export function buildGraphData(notes: Note[], options: GraphOptions): GraphData {
  const list = notes.filter((n) => !n.template)
  const ids = new Set(list.map((n) => n.id))
  const graph = buildLinkGraph(list)
  const nodes = new Map<string, GraphNode>()
  const links: GraphLink[] = []
  const pairs = new Set<string>()

  for (const note of list) {
    nodes.set(note.id, {
      id: note.id,
      kind: 'note',
      label: note.title || '未命名',
      icon: note.icon ?? (note.url ? '🔗' : '📄'),
      degree: 0,
    })
  }

  const addLink = (source: string, target: string, kind: GraphLinkKind) => {
    const key = source < target ? `${source}\n${target}` : `${target}\n${source}`
    if (pairs.has(key)) return
    pairs.add(key)
    links.push({ source, target, kind })
  }

  // 先加 [[連結]]，子頁面關係跟它重疊時就不再多畫一條
  for (const [from, targets] of graph.outgoing) {
    for (const to of targets) addLink(from, to, 'link')
  }

  if (options.children) {
    for (const note of list) {
      if (note.parent && ids.has(note.parent)) addLink(note.parent, note.id, 'child')
    }
  }

  if (options.tags) {
    for (const note of list) {
      for (const tag of allTags(note)) {
        const id = tagNodeId(tag)
        if (!nodes.has(id)) nodes.set(id, { id, kind: 'tag', label: tag, degree: 0 })
        addLink(note.id, id, 'tag')
      }
    }
  }

  if (options.missing) {
    for (const [from, titles] of graph.unresolved) {
      for (const title of titles) {
        if (!normalizeTitle(title)) continue
        const id = missingNodeId(title)
        if (!nodes.has(id)) nodes.set(id, { id, kind: 'missing', label: title, degree: 0 })
        addLink(from, id, 'missing')
      }
    }
  }

  for (const link of links) {
    nodes.get(link.source)!.degree++
    nodes.get(link.target)!.degree++
  }
  return { nodes: [...nodes.values()], links }
}

/** 不分方向的鄰居表，用來高亮與找區域圖譜 */
export function neighborMap(links: GraphLink[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  const add = (a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set())
    map.get(a)!.add(b)
  }
  for (const link of links) {
    add(link.source, link.target)
    add(link.target, link.source)
  }
  return map
}

/** 以某個節點為中心、depth 層以內的子圖 */
export function localGraph(data: GraphData, centerId: string, depth: number): GraphData {
  const neighbors = neighborMap(data.links)
  const keep = new Set([centerId])
  let frontier = [centerId]
  for (let level = 0; level < depth; level++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const other of neighbors.get(id) ?? []) {
        if (!keep.has(other)) {
          keep.add(other)
          next.push(other)
        }
      }
    }
    frontier = next
  }
  return {
    nodes: data.nodes.filter((n) => keep.has(n.id)),
    links: data.links.filter((l) => keep.has(l.source) && keep.has(l.target)),
  }
}
