import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state'
import { nextMarker, splitPrefix, taskToggle, toggleBlock, toggleWrap } from './format'

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
