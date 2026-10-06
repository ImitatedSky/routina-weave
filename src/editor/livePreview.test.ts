import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { findWikilinks, livePreview } from './livePreview'

describe('findWikilinks', () => {
  it('一般連結顯示標題', () => {
    expect(findWikilinks('看 [[週會]] 吧', 10)).toEqual([{ from: 12, to: 18, target: '週會', textFrom: 14, textTo: 16 }])
  })

  it('有別名時連到標題、顯示別名', () => {
    const [link] = findWikilinks('[[週會|開會]]')
    expect(link.target).toBe('週會')
    expect('[[週會|開會]]'.slice(link.textFrom, link.textTo)).toBe('開會')
  })

  it('空的別名當作沒有', () => {
    const [link] = findWikilinks('[[週會|]]')
    expect('[[週會|]]'.slice(link.textFrom, link.textTo)).toBe('週會')
  })
})

describe('livePreview', () => {
  const doc = '# 標題\n\n**粗體** 和 [[週會]] 和 [網站](https://a.com)\n- [ ] 待辦\n- 項目\n\n---\n\n> [!tip] 提示標題\n> 內容\n\n`[[不是連結]]`'
  let view: EditorView
  let opened: string[]

  beforeEach(() => {
    opened = []
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc,
        extensions: [markdown({ base: markdownLanguage }), livePreview((title) => opened.push(title))],
      }),
    })
  })
  afterEach(() => view.destroy())

  it('沒有焦點時藏起記號，原文不變', () => {
    const text = view.contentDOM.textContent!
    expect(text).not.toContain('#')
    expect(text).not.toContain('**')
    expect(text).not.toContain('[[週會]]')
    expect(text).not.toContain('https://a.com')
    expect(text).toContain('粗體')
    expect(text).toContain('網站')
    expect(view.contentDOM.querySelector('input.cm-lp-task')).not.toBeNull()
    expect(view.contentDOM.querySelector('.cm-lp-hr')).not.toBeNull()
    expect(text).not.toContain('[!tip]')
    expect(view.contentDOM.querySelector('.cm-lp-callout-title')?.textContent).toBe('提示標題')
    // 程式碼裡的 [[ ]] 不是連結
    expect(view.contentDOM.querySelectorAll('[data-wikilink]')).toHaveLength(1)
    expect(view.state.doc.toString()).toBe(doc)
  })

  it('點核取方塊切換原文的 [ ]', () => {
    const box = view.contentDOM.querySelector('input.cm-lp-task')!
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    expect(view.state.doc.toString()).toContain('- [x] 待辦')
  })

  it('點預覽中的 [[連結]] 打開頁面', () => {
    const link = view.contentDOM.querySelector('[data-wikilink]')!
    expect(link.textContent).toBe('週會')
    link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    expect(opened).toEqual(['週會'])
  })
})
