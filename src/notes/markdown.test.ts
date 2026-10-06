import { fromMarkdown, toMarkdown, inlineTags, allTags } from './markdown'
import type { Note } from './types'

const base: Note = {
  id: 'a1',
  title: '書單',
  body: '# 內文\n\n第二段',
  parent: null,
  order: 2,
  tags: ['閱讀'],
  props: { 作者: 'James Clear', 評分: 5, 讀完: true },
  view: 'table',
  created: '2026-10-06T00:00:00.000Z',
  updated: '2026-10-06T01:00:00.000Z',
}

describe('toMarkdown / fromMarkdown', () => {
  it('來回轉換不走樣', () => {
    expect(fromMarkdown(toMarkdown(base))).toEqual(base)
  })

  it('內文原封不動，包含開頭的空行以外的所有字', () => {
    const body = '---\n不是 frontmatter\n\n  縮排\n'
    const back = fromMarkdown(toMarkdown({ ...base, body }))!
    expect(back.body).toBe(body)
  })

  it('不認得的欄位保留下來', () => {
    const text = '---\nid: x\ntitle: T\ncustom: 123\naliases: [a, b]\n---\n\nbody'
    const note = fromMarkdown(text)!
    expect(note.extra).toEqual({ custom: 123, aliases: ['a', 'b'] })
    expect(toMarkdown(note)).toContain('custom: 123')
  })

  it('沒有 frontmatter 的檔案（例如從 Obsidian 來的）也讀得進來', () => {
    const note = fromMarkdown('純文字筆記', '檔名')!
    expect(note.title).toBe('檔名')
    expect(note.body).toBe('純文字筆記')
    expect(note.parent).toBeNull()
    expect(note.id).toBeTruthy()
  })

  it('frontmatter 壞掉時回傳 null', () => {
    expect(fromMarkdown('---\nid: [\n---\nbody')).toBeNull()
  })

  it('不合法的 view 值被忽略', () => {
    expect(fromMarkdown('---\nid: x\nview: kanban\n---\n')!.view).toBeUndefined()
  })
})

describe('inlineTags', () => {
  it('抓內文的 #標籤，不含標題記號、純數字與程式碼', () => {
    const body = '# 標題\n\n讀完 #閱讀 與 #自我成長/習慣\n#3 不算\n`#code` 不算\n```\n#也不算\n```'
    expect(inlineTags(body)).toEqual(['閱讀', '自我成長/習慣'])
  })

  it('網址裡的 # 不算', () => {
    expect(inlineTags('看 https://a.com/#section')).toEqual([])
  })

  it('allTags 合併 frontmatter 與內文並去重', () => {
    expect(allTags({ ...base, tags: ['閱讀'], body: '#閱讀 #新' })).toEqual(['閱讀', '新'])
  })
})
