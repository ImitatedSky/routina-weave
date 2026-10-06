import { parseLinks, renameLinks, buildLinkGraph, titleIndex } from './links'
import type { Note } from './types'

function note(id: string, title: string, body = '', extra: Partial<Note> = {}): Note {
  return {
    id, title, body, parent: null, order: 0, tags: [], props: {},
    created: `2026-10-06T00:00:0${id.length}.000Z`, updated: '2026-10-06T00:00:00.000Z', ...extra,
  }
}

describe('parseLinks', () => {
  it('抓標題與別名，略過程式碼', () => {
    expect(parseLinks('看 [[原子習慣]] 和 [[深度工作|這本]]，`[[不算]]`')).toEqual([
      { target: '原子習慣', alias: undefined },
      { target: '深度工作', alias: '這本' },
    ])
  })
})

describe('renameLinks', () => {
  it('改掉指向舊標題的連結，保留別名，不分大小寫', () => {
    const body = '[[Old]] [[old|別名]] [[Other]]'
    expect(renameLinks(body, 'old', 'New')).toBe('[[New]] [[New|別名]] [[Other]]')
  })

  it('沒有變動時回傳同一個字串', () => {
    const body = '[[Other]]'
    expect(renameLinks(body, 'Old', 'New')).toBe(body)
  })

  it('只改大小寫視為沒改', () => {
    const body = '[[old]]'
    expect(renameLinks(body, 'old', 'OLD')).toBe(body)
  })
})

describe('buildLinkGraph', () => {
  it('建立出入連結、未建立的連結，範本不算', () => {
    const a = note('a', 'A', '[[B]] [[不存在]] [[A]]')
    const b = note('bb', 'B', '[[A]]')
    const t = note('ttt', '範本', '[[A]]', { template: true })
    const g = buildLinkGraph([a, b, t])
    expect([...g.outgoing.get('a')!]).toEqual(['bb'])
    expect([...g.incoming.get('a')!]).toEqual(['bb'])
    expect([...g.unresolved.get('a')!]).toEqual(['不存在'])
    expect(g.incoming.get('a')!.has('ttt')).toBe(false)
  })

  it('同名時連到最早建立的那則', () => {
    const older = note('x', '重複')
    const newer = note('yy', '重複')
    expect(titleIndex([newer, older]).get('重複')).toBe('x')
  })
})
