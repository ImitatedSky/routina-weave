import { coverAttachment, dragCoverY, presetCover, presetCss } from './covers'
import { fromMarkdown, toMarkdown } from './markdown'

describe('covers', () => {
  it('內建封面給 CSS，圖片封面給附件 id', () => {
    expect(presetCss(presetCover('ocean'))).toContain('linear-gradient')
    expect(presetCss('abc-123')).toBeUndefined()
    expect(presetCss('preset:不存在')).toBeUndefined()
    expect(coverAttachment('abc-123')).toBe('abc-123')
    expect(coverAttachment('preset:ocean')).toBeUndefined()
    expect(coverAttachment(undefined)).toBeUndefined()
  })

  it('封面寫進 frontmatter 再讀回來', () => {
    const note = fromMarkdown('---\nid: a\ntitle: T\ncover: preset:ocean\n---\n\n內文')!
    expect(note.cover).toBe('preset:ocean')
    expect(toMarkdown(note)).toContain('cover: preset:ocean')
  })
})

describe('dragCoverY', () => {
  const box = { width: 400, height: 150 }
  // 400 寬時這張 4:3 的圖會是 300 高，上下超出 150
  const photo = { width: 1600, height: 1200 }

  it('往下拖看上面，往上拖看下面，超出範圍會停在 0 或 100', () => {
    expect(dragCoverY(50, 75, box, photo)).toBe(0)
    expect(dragCoverY(50, -75, box, photo)).toBe(100)
    expect(dragCoverY(50, 30, box, photo)).toBe(30)
    expect(dragCoverY(50, 500, box, photo)).toBe(0)
  })

  it('圖片比框扁，上下沒得移，位置不變', () => {
    expect(dragCoverY(50, 40, box, { width: 3000, height: 500 })).toBe(50)
  })
})
