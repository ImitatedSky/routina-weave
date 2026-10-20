import { renderMarkdown, sanitizeHtml, toggleTask } from './render'

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

/** 惡意 Markdown：輸出不能有腳本、事件屬性、危險的 href 或 style */
const PAYLOADS = [
  '[a](javascript:alert(1))',
  '[a](JaVaScRiPt:alert(1))',
  '[a](&#106;avascript:alert(1))',
  '[a](java\tscript:alert(1))',
  '<javascript:alert(1)>',
  '[a][r]\n\n[r]: javascript:alert(1)',
  '[a](vbscript:msgbox(1))',
  '[a](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)',
  '[a](file:///etc/passwd)',
  '[a](//evil.example/phish)',
  '[a](/other-app/)',
  '[a](blob:https://a.example/x)',
  '[a](intent://x#Intent;end)',
  '[a](https://x.example "t\\" onmouseover=alert(1) x=\\"")',
  '[[a" onmouseover="alert(1)]]',
  '[[<img src=x onerror=alert(1)>|<svg onload=alert(1)>]]',
  ' #tag"onx=1',
  '<span style="color:red;background:url(https://evil/x)">x</span>',
  '<mark style="background:rgba(1,2,3) url(x)">x</mark>',
  '<span style="color:#fff"><img src=x onerror=alert(1)>[a](javascript:alert(1))</span>',
  '<div style="position:fixed;inset:0">clickjack</div><iframe src="https://evil"></iframe>',
  '<style>*{display:none}</style>',
  '> [!tip" onclick="alert(1)] t',
  '> [!tip] <img src=x onerror=alert(1)>',
  '- [ ] <img src=x onerror=alert(1)>',
  '![a" onerror="alert(1)](_attachments/abc.jpg)',
  '```cardlink\nurl: https://a.example/"><script>alert(1)</script>\ntitle: <img src=x onerror=alert(1)>\nthumbnail: x" onerror="alert(1)\n```',
  '```cardlink\nurl: javascript:alert(1)//https://\n```',
  '```"><img src=x onerror=alert(1)>\ncode\n```',
]

describe('renderMarkdown 擋惡意內容', () => {
  it.each(PAYLOADS)('%s', (payload) => {
    const root = document.createElement('div')
    root.innerHTML = renderMarkdown(payload, ctx)
    expect(root.querySelector('script, iframe, style, svg, object, embed, form')).toBeNull()
    for (const el of root.querySelectorAll('*')) {
      for (const attr of el.attributes) expect(attr.name).not.toMatch(/^on/i)
      const href = el.getAttribute('href')
      if (href !== null) expect(href).toMatch(/^(?:https?:|mailto:|#)/i)
      const style = el.getAttribute('style')
      if (style !== null) expect(style).toMatch(/^(?:color|background):(?:#[0-9a-f]+|rgba?\([\d., ]+\))$/i)
    }
  })

  it('會在原分頁導走的連結拿掉 href', () => {
    for (const md of ['[a](//evil.example/phish)', '[a](/other-app/)', '[a](blob:https://a.example/x)', '[a](https:/other-app/)', '[a](https:evil.example)']) {
      expect(renderMarkdown(md, ctx)).not.toContain('href')
    }
  })

  it('原始 HTML 的 svg、form、id/name、srcset 一律拿掉', () => {
    const html = sanitizeHtml('<svg><a xlink:href="//evil">x</a></svg><form action="//evil"><input></form><a id="google" name="x" href="#">y</a><img srcset="https://evil/a.png 1x">')
    expect(html).not.toMatch(/<svg|<form|id=|name=|srcset|xlink/)
  })

  it('站內連結、http(s)、mailto 照常保留', () => {
    expect(renderMarkdown('[a](#/page/abc)', ctx)).toContain('href="#/page/abc"')
    expect(renderMarkdown('[a](https://a.example)', ctx)).toContain('href="https://a.example"')
    expect(renderMarkdown('<a@b.example>', ctx)).toContain('href="mailto:a@b.example"')
    expect(renderMarkdown('[[有]]', ctx)).toContain('href="#"')
  })

  it('連結卡片的 target、rel 與待辦的 type 沒被刪掉', () => {
    const card = renderMarkdown('```cardlink\nurl: https://a.example\n```', ctx)
    expect(card).toContain('target="_blank"')
    expect(card).toContain('rel="noopener noreferrer"')
    expect(renderMarkdown('- [ ] 一', ctx)).toContain('type="checkbox"')
  })

  it('上色規則產生的 style 保留', () => {
    expect(renderMarkdown('<span style="color:#e5484d">紅</span>', ctx)).toContain('style="color:#e5484d"')
    expect(renderMarkdown('<mark style="background-color:rgba(255, 200, 0, 0.35)">黃</mark>', ctx)).toContain(
      'style="background:rgba(255, 200, 0, 0.35)"',
    )
    expect(renderMarkdown('==螢光==', ctx)).toContain('style="background:rgba(255, 200, 0, 0.35)"')
  })
})

describe('sanitizeHtml', () => {
  it('style 只留顏色，其他寫法整個刪掉', () => {
    expect(sanitizeHtml('<span style="color:#e5484d">x</span>')).toContain('style="color:#e5484d"')
    expect(sanitizeHtml('<div style="position:fixed;inset:0">x</div>')).toBe('<div>x</div>')
    expect(sanitizeHtml('<span style="color:#fff;background:url(https://evil/x)">x</span>')).toBe('<span>x</span>')
  })

  it('href 只留 http(s)、mailto 與 #', () => {
    expect(sanitizeHtml('<a href="//evil.example">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="intent://x#Intent;end">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="#/tag/x">x</a>')).toBe('<a href="#/tag/x">x</a>')
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
