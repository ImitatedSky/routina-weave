import { attachmentIdFromSrc, attachmentImageSrc, bodyImageAttachments } from './images'
import { renderMarkdown } from './render'

describe('內文圖片', () => {
  it('附件路徑與 id 互轉，子資料夾裡的 ../ 寫法也認得', () => {
    expect(attachmentImageSrc('abc-1')).toBe('_attachments/abc-1.jpg')
    expect(attachmentIdFromSrc('_attachments/abc-1.jpg')).toBe('abc-1')
    expect(attachmentIdFromSrc('../../_attachments/abc-1.png')).toBe('abc-1')
    expect(attachmentIdFromSrc('https://a.com/x.jpg')).toBeUndefined()
    expect(attachmentIdFromSrc('_attachments/../secret')).toBeUndefined()
  })

  it('找出內文用到的附件', () => {
    expect(bodyImageAttachments('a ![](_attachments/x1.jpg) b ![圖](https://a.com/y.png) ![](_attachments/z2.jpg)')).toEqual(['x1', 'z2'])
  })

  it('預覽：附件圖片等 Preview 補上 src，網址圖片照常', () => {
    const ctx = { exists: () => true }
    const local = renderMarkdown('![貓](_attachments/x1.jpg)', ctx)
    expect(local).toContain('data-attachment="x1"')
    expect(local).toContain('alt="貓"')
    expect(local).not.toContain('src=')
    expect(renderMarkdown('![](https://a.com/y.png)', ctx)).toContain('src="https://a.com/y.png"')
  })
})
