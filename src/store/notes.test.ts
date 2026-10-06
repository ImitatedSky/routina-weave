import { useNotes, childrenOf, pathOf } from './notes'

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
    useNotes.getState().updateNote(a.id, { title: '新名' })
    expect(useNotes.getState().notes[b.id].body).toBe('看 [[新名]]')
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
