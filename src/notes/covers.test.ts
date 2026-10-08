import { coverAttachment, presetCover, presetCss } from './covers'
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
