import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { MarkdownEditor } from './MarkdownEditor'

// jsdom 沒有 matchMedia
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function getView(container: HTMLElement) {
  return EditorView.findFromDOM(container.querySelector<HTMLElement>('.cm-editor')!)!
}

/** 模擬使用者在 pos 打字 */
function type(view: EditorView, pos: number, text: string) {
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
    userEvent: 'input.type',
  })
}

describe('MarkdownEditor 外部改了 value', () => {
  it('換掉內容，不呼叫 onChange，游標夾在新長度內', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<MarkdownEditor value="舊的內容很長很長" onChange={onChange} />)
    const view = getView(container)
    view.dispatch({ selection: { anchor: 8 } })

    rerender(<MarkdownEditor value="新的" onChange={onChange} />)
    expect(view.state.doc.toString()).toBe('新的')
    expect(view.state.selection.main.head).toBe(2)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('打字照常回報；外層存回同一份內容時不重設內容與游標', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<MarkdownEditor value="ab" onChange={onChange} />)
    const view = getView(container)
    type(view, 1, 'X')
    expect(onChange).toHaveBeenLastCalledWith('aXb')

    rerender(<MarkdownEditor value="aXb" onChange={onChange} />)
    expect(view.state.doc.toString()).toBe('aXb')
    expect(view.state.selection.main.head).toBe(2)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('外層存回的是比較舊的一版時，不蓋掉後面剛打的字', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<MarkdownEditor value="ab" onChange={onChange} />)
    const view = getView(container)
    type(view, 2, 'c')
    type(view, 3, 'd')

    rerender(<MarkdownEditor value="abc" onChange={onChange} />)
    expect(view.state.doc.toString()).toBe('abcd')
  })

  it('還有沒存的字時外部改了 value，保留編輯器裡的字', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<MarkdownEditor value="ab" onChange={onChange} />)
    const view = getView(container)
    type(view, 2, 'c')

    rerender(<MarkdownEditor value="別台裝置改的" onChange={onChange} />)
    expect(view.state.doc.toString()).toBe('abc')

    // 存回去之後就是乾淨的，下一次外部改動會換進來
    rerender(<MarkdownEditor value="abc" onChange={onChange} />)
    rerender(<MarkdownEditor value="又改了" onChange={onChange} />)
    expect(view.state.doc.toString()).toBe('又改了')
  })

  it('外部換進來的內容不能用復原退回去', () => {
    const { container, rerender } = render(<MarkdownEditor value="舊" onChange={() => {}} />)
    const view = getView(container)
    rerender(<MarkdownEditor value="新" onChange={() => {}} />)
    view.contentDOM.focus()
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    expect(view.state.doc.toString()).toBe('新')
  })
})
