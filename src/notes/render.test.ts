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

describe('摺疊提示框', () => {
  it('[!note]- 預設收合，標題獨立成一個區塊', () => {
    const html = renderMarkdown('> [!note]- 標題\n> 內容', ctx)
    expect(html).toContain('data-fold="closed"')
    expect(html).toMatch(/<blockquote[^>]*>\s*<div class="callout-title">標題<\/div>\s*<p>內容<\/p>/)
    expect(html).toContain('內容')
  })

  it('[!tip]+ 預設展開，沒有 +/- 就不能摺疊', () => {
    expect(renderMarkdown('> [!tip]+ 標題', ctx)).toContain('data-fold="open"')
    expect(renderMarkdown('> [!tip] 標題', ctx)).not.toContain('data-fold')
  })
})

describe('上色', () => {
  it('文字顏色與背景顏色，中間的格式照常解析', () => {
    const html = renderMarkdown('<span style="color:#e5484d">紅**粗**</span> <mark style="background:rgba(255, 200, 0, 0.35)">黃底</mark>', ctx)
    expect(html).toContain('<span style="color:#e5484d">紅<strong>粗</strong></span>')
    expect(html).toContain('<mark style="background:rgba(255, 200, 0, 0.35)">黃底</mark>')
  })

  it('==螢光==', () => {
    expect(renderMarkdown('畫 ==重點== 了', ctx)).toContain('<mark style="background:rgba(255, 200, 0, 0.35)">重點</mark>')
    expect(renderMarkdown('a == b == c', ctx)).not.toContain('<mark')
  })

  it('其他 style 或標籤一律當純文字', () => {
    const html = renderMarkdown('<span style="color:red;background:url(x)">x</span> <span onclick="a()">y</span>', ctx)
    expect(html).not.toContain('<span')
  })

  it('沒有結束標籤就當純文字', () => {
    expect(renderMarkdown('<span style="color:#e5484d">沒關', ctx)).not.toContain('<span')
  })
})
