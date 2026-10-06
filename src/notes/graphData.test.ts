import { describe, expect, it } from 'vitest'
import type { Note } from './types'
import { buildGraphData, localGraph, missingNodeId, neighborMap, tagNodeId } from './graphData'

let seq = 0
function note(fields: Partial<Note>): Note {
  seq++
  return {
    id: `n${seq}`,
    title: `筆記${seq}`,
    body: '',
    parent: null,
    order: 0,
    tags: [],
    props: {},
    created: `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
    updated: '2026-01-01T00:00:00Z',
    ...fields,
  }
}

const none = { tags: false, missing: false, children: false }

describe('buildGraphData', () => {
  it('筆記是節點、[[連結]] 是線，互相連結只畫一條', () => {
    const a = note({ id: 'a', title: 'A', body: '[[B]]' })
    const b = note({ id: 'b', title: 'B', body: '[[A]]' })
    const c = note({ id: 'c', title: 'C' })
    const data = buildGraphData([a, b, c], none)
    expect(data.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(data.links).toEqual([{ source: 'a', target: 'b', kind: 'link' }])
    const degree = Object.fromEntries(data.nodes.map((n) => [n.id, n.degree]))
    expect(degree).toEqual({ a: 1, b: 1, c: 0 })
  })

  it('排除範本，圖示沒設時依類型給預設值', () => {
    const tpl = note({ id: 't', title: 'T', template: true, body: '[[A]]' })
    const a = note({ id: 'a', title: 'A', icon: '🌱' })
    const url = note({ id: 'u', title: 'U', url: 'https://example.com' })
    const plain = note({ id: 'p', title: 'P' })
    const data = buildGraphData([tpl, a, url, plain], none)
    expect(data.nodes.map((n) => [n.id, n.icon])).toEqual([['a', '🌱'], ['u', '🔗'], ['p', '📄']])
    expect(data.links).toEqual([])
  })

  it('子頁面關係可以切換，跟 [[連結]] 重疊時不重複', () => {
    const parent = note({ id: 'p', title: 'P', body: '[[C1]]' })
    const c1 = note({ id: 'c1', title: 'C1', parent: 'p' })
    const c2 = note({ id: 'c2', title: 'C2', parent: 'p' })
    expect(buildGraphData([parent, c1, c2], none).links).toHaveLength(1)
    expect(buildGraphData([parent, c1, c2], { ...none, children: true }).links).toEqual([
      { source: 'p', target: 'c1', kind: 'link' },
      { source: 'p', target: 'c2', kind: 'child' },
    ])
  })

  it('標籤節點包含 frontmatter 與內文的 #標籤', () => {
    const a = note({ id: 'a', tags: ['讀書'], body: '今天 #運動' })
    const b = note({ id: 'b', body: '#讀書 心得' })
    const data = buildGraphData([a, b], { ...none, tags: true })
    const tag = data.nodes.find((n) => n.id === tagNodeId('讀書'))
    expect(tag).toMatchObject({ kind: 'tag', label: '讀書', degree: 2 })
    expect(data.nodes.some((n) => n.id === tagNodeId('運動'))).toBe(true)
    expect(data.links.filter((l) => l.kind === 'tag')).toHaveLength(3)
  })

  it('未建立的連結是另一種節點，同名（不分大小寫）合成一個', () => {
    const a = note({ id: 'a', body: '[[Idea]]' })
    const b = note({ id: 'b', body: '[[idea]] [[ 另一個 ]]' })
    expect(buildGraphData([a, b], none).nodes).toHaveLength(2)
    const data = buildGraphData([a, b], { ...none, missing: true })
    const idea = data.nodes.find((n) => n.id === missingNodeId('Idea'))
    expect(idea).toMatchObject({ kind: 'missing', label: 'Idea', degree: 2 })
    expect(data.nodes.some((n) => n.id === missingNodeId('另一個'))).toBe(true)
  })
})

describe('localGraph', () => {
  // a - b - c - d，e 獨立
  const notes = [
    note({ id: 'a', title: 'A', body: '[[B]]' }),
    note({ id: 'b', title: 'B', body: '[[C]]' }),
    note({ id: 'c', title: 'C', body: '[[D]]' }),
    note({ id: 'd', title: 'D' }),
    note({ id: 'e', title: 'E' }),
  ]
  const data = buildGraphData(notes, none)

  it('只留兩層內的鄰居，不管連結方向', () => {
    const local = localGraph(data, 'c', 2)
    expect(local.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(localGraph(data, 'a', 2).nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(localGraph(data, 'a', 2).links).toHaveLength(2)
  })

  it('孤立節點只有自己', () => {
    expect(localGraph(data, 'e', 2)).toEqual({ nodes: [data.nodes[4]], links: [] })
  })
})

describe('neighborMap', () => {
  it('雙向都記', () => {
    const map = neighborMap([{ source: 'a', target: 'b', kind: 'link' }])
    expect([...map.get('a')!]).toEqual(['b'])
    expect([...map.get('b')!]).toEqual(['a'])
  })
})
