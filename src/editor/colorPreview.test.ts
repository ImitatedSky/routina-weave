import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { colorPreview } from './colorPreview'

function mount(doc: string) {
  return new EditorView({
    parent: document.body,
    state: EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage }), colorPreview] }),
  })
}

describe('colorPreview', () => {
  it('沒有游標的行藏起標籤，字帶顏色', () => {
    const view = mount('前<span style="color:#e5484d">紅字</span>後 ==重點==')
    const text = view.contentDOM.textContent
    expect(text).toBe('前紅字後 重點')
    // jsdom 會把顏色正規化成 rgb()
    const colored = [...view.contentDOM.querySelectorAll<HTMLElement>('span')].find((el) => el.style.color)
    expect(colored?.textContent).toBe('紅字')
    expect(colored?.style.color).toBe('rgb(229, 72, 77)')
    // 原文完全沒動
    expect(view.state.doc.toString()).toBe('前<span style="color:#e5484d">紅字</span>後 ==重點==')
    view.destroy()
  })

  it('程式碼裡的標籤照原樣顯示', () => {
    const view = mount('`<span style="color:#e5484d">x</span>`')
    expect(view.contentDOM.textContent).toContain('<span')
    view.destroy()
  })
})
