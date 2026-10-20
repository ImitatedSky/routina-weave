import { useNotes, childrenOf, pathOf, descendants } from './notes'
import type { Note } from '@/notes/types'

beforeEach(() => {
  useNotes.setState({ loaded: true, notes: {} })
})

describe('notes store', () => {
  it('新增子頁面時套用上層的預設範本', () => {
    const { createNote } = useNotes.getState()
    const tpl = createNote({ title: '範本', template: true, body: '標題是 {{title}}', props: { 狀態: '想讀' } })
    const parent = createNote({ title: '書單', childTemplate: tpl.id })
    const child = useNotes.getState().createNote({ parent: parent.id, title: '新書' })
    expect(child.body).toBe('標題是 新書')
    expect(child.props).toEqual({ 狀態: '想讀' })
    expect(child.template).toBeUndefined()
  })

  it('templateId: null 表示不要套範本', () => {
    const { createNote } = useNotes.getState()
    const tpl = createNote({ title: '範本', template: true, body: 'x' })
    const parent = createNote({ title: '書單', childTemplate: tpl.id })
    expect(useNotes.getState().createNote({ parent: parent.id, templateId: null }).body).toBe('')
  })

  it('改標題時一起改其他筆記的連結', () => {
    const { createNote } = useNotes.getState()
    const a = createNote({ title: '舊名' })
    const b = createNote({ title: 'B', body: '看 [[舊名]]' })
    const before = useNotes.getState().notes[b.id].updated
    useNotes.getState().updateNote(a.id, { title: '新名' })
    expect(useNotes.getState().notes[b.id].body).toBe('看 [[新名]]')
    // 連結被改的那則也算修改過，雲端同步才會把它傳上去
    expect(useNotes.getState().notes[b.id].updated >= before).toBe(true)
    expect(useNotes.getState().notes[b.id].updated).toBe(useNotes.getState().notes[a.id].updated)
  })

  it('刪除時連同子頁面', () => {
    const { createNote } = useNotes.getState()
    const a = createNote({ title: 'A' })
    const b = useNotes.getState().createNote({ title: 'B', parent: a.id })
    const c = useNotes.getState().createNote({ title: 'C', parent: b.id })
    expect(useNotes.getState().deleteNote(a.id).sort()).toEqual([a.id, b.id, c.id].sort())
    expect(useNotes.getState().notes).toEqual({})
  })

  it('不能搬到自己的子頁面底下', () => {
    const { createNote } = useNotes.getState()
    const a = createNote({ title: 'A' })
    const b = useNotes.getState().createNote({ title: 'B', parent: a.id })
    expect(useNotes.getState().moveNote(a.id, b.id)).toBe(false)
    expect(useNotes.getState().moveNote(b.id, null)).toBe(true)
    expect(useNotes.getState().notes[b.id].parent).toBeNull()
  })

  it('子頁面依 order 排序，路徑從最上層開始', () => {
    const { createNote } = useNotes.getState()
    const a = createNote({ title: 'A' })
    const b1 = useNotes.getState().createNote({ title: 'B1', parent: a.id })
    const b2 = useNotes.getState().createNote({ title: 'B2', parent: a.id })
    const notes = useNotes.getState().notes
    expect(childrenOf(notes, a.id).map((n) => n.id)).toEqual([b1.id, b2.id])
    expect(pathOf(notes, b2.id).map((n) => n.title)).toEqual(['A', 'B2'])
  })
})

describe('範本的欄位型別', () => {
  it('extra.propTypes 跟著範本帶到新頁面，其他 extra 不帶', () => {
    const { createNote } = useNotes.getState()
    const tpl = createNote({
      title: '範本', template: true, props: { 截止日: '' },
      extra: { propTypes: { 截止日: 'date' }, tableSort: { key: '截止日', dir: 'asc' } },
    })
    const child = useNotes.getState().createNote({ title: '新', templateId: tpl.id })
    expect(child.extra).toEqual({ propTypes: { 截止日: 'date' } })
  })
})

describe('封面與附件', () => {
  it('範本的封面帶到新頁面', () => {
    const { createNote } = useNotes.getState()
    const tpl = createNote({ title: '範本', template: true, cover: 'preset:sand' })
    expect(useNotes.getState().createNote({ title: '新', templateId: tpl.id }).cover).toBe('preset:sand')
  })

  it('刪頁面時，別的頁面還在用的封面圖片不刪', async () => {
    const db = await import('@/storage/db')
    await db.putAttachment({ id: 'img1', blob: new Blob(['x']), type: 'image/jpeg' })
    const { createNote } = useNotes.getState()
    const a = createNote({ title: 'A', cover: 'img1' })
    const b = useNotes.getState().createNote({ title: 'B', cover: 'img1' })
    useNotes.getState().deleteNote(a.id)
    await new Promise((r) => setTimeout(r, 20))
    expect(await db.getAttachment('img1')).toBeDefined()
    useNotes.getState().deleteNote(b.id)
    await vi.waitFor(async () => expect(await db.getAttachment('img1')).toBeUndefined())
  })
})

describe('子頁面對照表與快取', () => {
  it('筆記變動後 childrenOf 跟著更新', () => {
    const { createNote } = useNotes.getState()
    const a = createNote({ title: 'A' })
    expect(childrenOf(useNotes.getState().notes, a.id)).toEqual([])
    const b = useNotes.getState().createNote({ title: 'B', parent: a.id })
    expect(childrenOf(useNotes.getState().notes, a.id).map((n) => n.id)).toEqual([b.id])
    useNotes.getState().moveNote(b.id, null)
    expect(childrenOf(useNotes.getState().notes, a.id)).toEqual([])
  })

  it('上層互相指的壞資料不會讓 descendants 卡住', () => {
    const now = new Date().toISOString()
    const base = { body: '', order: 0, tags: [], props: {}, created: now, updated: now }
    const notes = {
      x: { ...base, id: 'x', title: 'X', parent: 'y' },
      y: { ...base, id: 'y', title: 'Y', parent: 'x' },
    }
    // 有正常結束就好；自己不算自己的子頁面
    expect(descendants(notes, 'x')).toEqual(['y'])
  })

  it('改了內文，標籤與連結重新解析', async () => {
    const { allTags } = await import('@/notes/markdown')
    const { buildLinkGraph } = await import('@/notes/links')
    const { createNote } = useNotes.getState()
    const target = createNote({ title: '目標' })
    const a = useNotes.getState().createNote({ title: 'A', body: '#舊' })
    expect(allTags(useNotes.getState().notes[a.id])).toEqual(['舊'])
    useNotes.getState().updateNote(a.id, { body: '#新 [[目標]]' })
    const notes = useNotes.getState().notes
    expect(allTags(notes[a.id])).toEqual(['新'])
    expect([...buildLinkGraph(Object.values(notes)).incoming.get(target.id)!]).toEqual([a.id])
  })
})

describe('removeNotes（雲端同步用）', () => {
  it('只刪指定的筆記，子頁面留著', () => {
    const { createNote } = useNotes.getState()
    const a = createNote({ title: 'A' })
    const b = useNotes.getState().createNote({ title: 'B', parent: a.id })
    useNotes.getState().removeNotes([a.id])
    const notes = useNotes.getState().notes
    expect(notes[a.id]).toBeUndefined()
    expect(notes[b.id]).toBeDefined()
  })
  it('importNotes／removeNotes：畫面當下就更新，回傳的 promise 等寫進 IndexedDB', async () => {
    const db = await import('@/storage/db')
    const note: Note = { id: 'sync-1', title: 'S', body: '', parent: null, order: 0, tags: [], props: {}, created: 'x', updated: 'x' }
    const imported = useNotes.getState().importNotes([note])
    expect(useNotes.getState().notes['sync-1']).toBeDefined()
    await imported
    expect((await db.loadNotes()).some((n) => n.id === 'sync-1')).toBe(true)

    const removed = useNotes.getState().removeNotes(['sync-1'])
    expect(useNotes.getState().notes['sync-1']).toBeUndefined()
    await removed
    expect((await db.loadNotes()).some((n) => n.id === 'sync-1')).toBe(false)
  })
})

describe('上層不存在的頁面', () => {
  it('上層找不到或指向自己時當成最上層，側邊欄才看得到', () => {
    const { createNote } = useNotes.getState()
    const ok = createNote({ title: '正常' })
    const child = useNotes.getState().createNote({ title: '子頁', parent: ok.id })
    const orphan = useNotes.getState().createNote({ title: '孤兒', parent: 'gone' })
    const self = useNotes.getState().createNote({ title: '自己' })
    useNotes.getState().updateNote(self.id, { parent: self.id })

    const notes = useNotes.getState().notes
    expect(childrenOf(notes, null).map((n) => n.title).sort()).toEqual(['孤兒', '正常', '自己'].sort())
    expect(childrenOf(notes, ok.id).map((n) => n.id)).toEqual([child.id])
    expect(childrenOf(notes, self.id)).toEqual([])
    expect(descendants(notes, self.id)).toEqual([])
    expect(pathOf(notes, orphan.id).map((n) => n.id)).toEqual([orphan.id])
  })
})
