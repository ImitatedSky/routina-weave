import { renderMarkdown, toggleTask } from './render'

const ctx = { exists: (t: string) => t === '有' }

describe('renderMarkdown', () => {
  it('[[連結]] 依是否存在加上不同樣式', () => {
    const html = renderMarkdown('[[有]] [[沒有|別名]]', ctx)
    expect(html).toContain('class="wikilink"')
    expect(html).toContain('class="wikilink missing"')
    expect(html).toContain('>別名</a>')
  })

  it('#標籤變成連到標籤頁的連結', () => {
    expect(renderMarkdown('讀 #閱讀', ctx)).toContain('href="#/tag/%E9%96%B1%E8%AE%80"')
  })

  it('待辦清單變成核取方塊', () => {
    const html = renderMarkdown('- [ ] 一\n- [x] 二', ctx)
    expect(html).toContain('<input type="checkbox" data-task="0">')
    expect(html).toContain('data-task="1" checked')
  })

  it('提示框', () => {
    const html = renderMarkdown('> [!tip] 小提醒\n> 內容', ctx)
    expect(html).toContain('class="callout"')
    expect(html).toContain('data-type="tip"')
    expect(html).toContain('小提醒')
    expect(html).toContain('內容')
  })

  it('原始 HTML 不會被執行', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> [x](javascript:alert(1))', ctx)
    // 轉義成文字顯示，不會變成真的標籤或連結
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href="javascript:')
  })
})

describe('toggleTask', () => {
  it('切換第 n 個待辦，略過程式碼區塊裡的', () => {
    const body = '- [ ] 一\n```\n- [ ] 假的\n```\n- [x] 二'
    expect(toggleTask(body, 1)).toBe('- [ ] 一\n```\n- [ ] 假的\n```\n- [ ] 二')
    expect(toggleTask(body, 0)).toBe('- [x] 一\n```\n- [ ] 假的\n```\n- [x] 二')
  })
})
