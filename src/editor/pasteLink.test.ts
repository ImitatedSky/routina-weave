import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { linkTarget, linkText, pasteLink, pastedUrl } from './pasteLink'
import { cardWidgets } from './cardWidget'
import { cardBlock } from '@/notes/cardlink'

function mount(doc: string, anchor: number, head = anchor) {
  return new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: EditorSelection.range(anchor, head),
      extensions: [markdown({ base: markdownLanguage }), pasteLink, cardWidgets],
    }),
  })
}

function paste(view: EditorView, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
  view.contentDOM.dispatchEvent(event)
}

describe('pastedUrl', () => {
  it('只有一個 http(s) 網址才算', () => {
    expect(pastedUrl(' https://a.com/x ')).toBe('https://a.com/x')
    expect(pastedUrl('看 https://a.com')).toBeNull()
    expect(pastedUrl('ftp://a.com')).toBeNull()
    expect(pastedUrl('https://localhost')).toBeNull()
  })

  it('連結文字的方括號與網址的括號不會弄壞 Markdown', () => {
    expect(linkText('a [b] c')).toBe('a ［b］ c')
    expect(linkTarget('https://a.com/x_(y)')).toBe('https://a.com/x_%28y%29')
  })
})

describe('貼上網址', () => {
  it('空白行變成卡片', () => {
    const view = mount('第一行\n', 4)
    paste(view, 'https://example.com/post')
    expect(view.state.doc.toString()).toBe('第一行\n' + cardBlock({ url: 'https://example.com/post', host: 'example.com' }) + '\n')
    view.destroy()
  })

  it('句子中間變成連結', () => {
    const view = mount('看這篇 ', 4)
    paste(view, 'https://example.com/post')
    expect(view.state.doc.toString()).toBe('看這篇 [example.com](https://example.com/post)')
    view.destroy()
  })

  it('有選字時選的字變成連結', () => {
    const view = mount('看這篇文章', 1, 3)
    paste(view, 'https://example.com/post')
    expect(view.state.doc.toString()).toBe('看[這篇](https://example.com/post)文章')
    view.destroy()
  })

  it('一般文字照常貼上', () => {
    const view = mount('', 0)
    paste(view, '不是網址')
    // 不攔，交給 CodeMirror 照常貼上
    expect(view.state.doc.toString()).toBe('不是網址')
    view.destroy()
  })
})

describe('編輯器裡的卡片', () => {
  it('游標不在區塊裡就顯示成卡片，游標進去就是原文', () => {
    const block = cardBlock({ url: 'https://a.com', title: '標題' })
    const view = mount(`前\n${block}\n後`, 0)
    expect(view.contentDOM.querySelector('.link-card')?.textContent).toContain('標題')
    view.dispatch({ selection: { anchor: 4 } })
    expect(view.contentDOM.querySelector('.link-card')).toBeNull()
    view.destroy()
  })
})
