import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state'
import { clearColor, nextMarker, splitPrefix, taskToggle, toggleBlock, toggleWrap, wrapColor } from './format'

/** 跑一次指令，回傳新的內容和選取範圍 */
function run(command: StateCommand, doc: string, anchor: number, head = anchor) {
  let state = EditorState.create({ doc, selection: EditorSelection.single(anchor, head) })
  command({ state, dispatch: (tr) => (state = tr.state) })
  const { from, to } = state.selection.main
  return { doc: state.doc.toString(), from, to }
}

describe('toggleWrap', () => {
  it('包起選取的字', () => {
    expect(run(toggleWrap('**'), 'a word b', 2, 6)).toEqual({ doc: 'a **word** b', from: 4, to: 8 })
  })

  it('已經是粗體就拿掉', () => {
    expect(run(toggleWrap('**'), 'a **word** b', 4, 8)).toEqual({ doc: 'a word b', from: 2, to: 6 })
  })

  it('沒選字時插一對記號，再按一次拿掉', () => {
    expect(run(toggleWrap('*'), 'ab', 1)).toEqual({ doc: 'a**b', from: 2, to: 2 })
    expect(run(toggleWrap('*'), 'a**b', 2)).toEqual({ doc: 'ab', from: 1, to: 1 })
  })

  it('粗體裡按斜體是加上斜體，不是拆掉粗體', () => {
    expect(run(toggleWrap('*'), '**word**', 2, 6).doc).toBe('***word***')
    expect(run(toggleWrap('**'), '***word***', 3, 7).doc).toBe('*word*')
  })
})

describe('行首記號', () => {
  it('splitPrefix', () => {
    expect(splitPrefix('  - [ ] 買菜')).toEqual({ indent: '  ', marker: '- [ ] ' })
    expect(splitPrefix('## 標題')).toEqual({ indent: '', marker: '## ' })
    expect(splitPrefix('普通文字')).toEqual({ indent: '', marker: '' })
  })

  it('標題循環 無 → # → ## → ### → 無', () => {
    expect(nextMarker('', 'heading')).toBe('# ')
    expect(nextMarker('# ', 'heading')).toBe('## ')
    expect(nextMarker('## ', 'heading')).toBe('### ')
    expect(nextMarker('### ', 'heading')).toBe('')
    expect(nextMarker('- ', 'heading')).toBe('# ')
  })

  it('清單與待辦互相切換', () => {
    expect(nextMarker('', 'bullet')).toBe('- ')
    expect(nextMarker('- ', 'bullet')).toBe('')
    expect(nextMarker('- ', 'task')).toBe('- [ ] ')
    expect(nextMarker('- [x] ', 'task')).toBe('')
    expect(nextMarker('- [ ] ', 'bullet')).toBe('- ')
  })

  it('toggleBlock 保留縮排，游標跟著移到記號後面', () => {
    expect(run(toggleBlock('task'), '  買菜', 0)).toEqual({ doc: '  - [ ] 買菜', from: 0, to: 0 })
    expect(run(toggleBlock('bullet'), '', 0)).toEqual({ doc: '- ', from: 2, to: 2 })
    expect(run(toggleBlock('heading'), 'a\nb', 0, 3).doc).toBe('# a\n# b')
  })

  it('taskToggle', () => {
    expect(taskToggle('- [ ] 買菜')).toEqual({ offset: 3, insert: 'x' })
    expect(taskToggle('  * [x] 買菜')).toEqual({ offset: 5, insert: ' ' })
    expect(taskToggle('1. [X] 買菜')).toEqual({ offset: 4, insert: ' ' })
    expect(taskToggle('- 買菜')).toBeNull()
  })
})

describe('wrapColor / clearColor', () => {
  const red = { open: '<span style="color:#e5484d">', close: '</span>' }
  const blue = { open: '<span style="color:#3e7bfa">', close: '</span>' }

  function run(doc: string, from: number, to: number, cmd: StateCommand) {
    let state = EditorState.create({ doc, selection: EditorSelection.range(from, to) })
    cmd({ state, dispatch: (tr) => (state = tr.state) })
    return { doc: state.doc.toString(), sel: state.selection.main }
  }

  it('選取的字包上顏色，選取範圍留在字上', () => {
    const r = run('一段文字', 1, 3, wrapColor(red.open, red.close))
    expect(r.doc).toBe('一<span style="color:#e5484d">段文</span>字')
    expect(r.doc.slice(r.sel.from, r.sel.to)).toBe('段文')
  })

  it('沒選字就插入一對空標籤，游標在中間', () => {
    const r = run('ab', 1, 1, wrapColor(red.open, red.close))
    expect(r.doc).toBe('a<span style="color:#e5484d"></span>b')
    expect(r.sel.from).toBe(1 + red.open.length)
  })

  it('已經有顏色就換掉，不會一層包一層', () => {
    const doc = '<span style="color:#e5484d">紅字</span>'
    const r = run(doc, red.open.length, red.open.length + 2, wrapColor(blue.open, blue.close))
    expect(r.doc).toBe('<span style="color:#3e7bfa">紅字</span>')
  })

  it('清除顏色，字留著', () => {
    const doc = '前<span style="color:#e5484d">紅字</span>後'
    const r = run(doc, 1 + red.open.length + 1, 1 + red.open.length + 1, clearColor)
    expect(r.doc).toBe('前紅字後')
  })
})
