import { cardBlock, cardThumbnails, parseCard } from './cardlink'
import { renderMarkdown } from './render'

const inner = (block: string) => block.split('\n').slice(1, -1).join('\n')

describe('cardlink', () => {
  it('寫出來再讀回去不走樣，標題有冒號、引號也沒問題', () => {
    const card = {
      url: 'https://example.com/a?b=1',
      title: 'Obsidian: "Sharpen" your thinking',
      description: '說明',
      host: 'example.com',
      image: 'https://example.com/og.jpg',
      thumbnail: 'abc',
    }
    const block = cardBlock(card)
    expect(block.startsWith('```cardlink\nurl: https://example.com/a?b=1\n')).toBe(true)
    expect(block.endsWith('\n```')).toBe(true)
    expect(parseCard(inner(block))).toEqual(card)
  })

  it('沒有網址、或網址不是 http(s) 就不算卡片', () => {
    expect(parseCard('title: x')).toBeNull()
    expect(parseCard('url: javascript:alert(1)')).toBeNull()
    expect(parseCard('url: [')).toBeNull()
  })

  it('image 只接受 http(s)', () => {
    expect(parseCard('url: https://a.com\nimage: javascript:alert(1)')?.image).toBeUndefined()
  })

  it('找出內文裡所有卡片的縮圖', () => {
    const body = `a\n${cardBlock({ url: 'https://a.com', thumbnail: 't1' })}\nb\n${cardBlock({ url: 'https://b.com' })}`
    expect(cardThumbnails(body)).toEqual(['t1'])
  })

  it('預覽畫成卡片，文字都有跳脫', () => {
    const html = renderMarkdown(cardBlock({ url: 'https://a.com', title: '<b>標題</b>', thumbnail: 't1' }), { exists: () => true })
    expect(html).toContain('class="link-card"')
    expect(html).toContain('href="https://a.com"')
    expect(html).toContain('&lt;b&gt;標題&lt;/b&gt;')
    expect(html).toContain('data-attachment="t1"')
  })

  it('格式壞掉就照一般程式碼區塊顯示', () => {
    expect(renderMarkdown('```cardlink\ntitle: 沒網址\n```', { exists: () => true })).toContain('<pre>')
  })
})
