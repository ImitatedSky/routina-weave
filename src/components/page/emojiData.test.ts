import data from 'emojibase-data/zh-hant/data.json'
import { groupEmoji, searchEmoji } from './emojiData'

const raw = data as unknown as Parameters<typeof groupEmoji>[0]

describe('emoji 資料', () => {
  it('依分類整理，略過「元件」，順序照 emojibase', () => {
    const groups = groupEmoji(raw, Infinity)
    expect(groups.map((g) => g.label)).toEqual([
      '笑臉和情緒', '人物和身體', '動物和自然', '食物和飲料', '旅遊和地點', '活動', '物品', '符號', '旗幟',
    ])
    expect(groups[0].items[0].emoji).toBe('😀')
    expect(groups.flatMap((g) => g.items).length).toBeGreaterThan(1500)
  })

  it('裝置不支援的新版 emoji 不列出來', () => {
    const all = groupEmoji(raw, Infinity).flatMap((g) => g.items)
    const old = groupEmoji(raw, 11).flatMap((g) => g.items)
    expect(old.length).toBeLessThan(all.length)
    expect(old.every((e) => e.version <= 11)).toBe(true)
    expect(old.some((e) => e.emoji === '🫠')).toBe(false)
  })

  it('用中文搜尋名稱與關鍵字，名稱開頭相同的在前面', () => {
    const groups = groupEmoji(raw, Infinity)
    const cats = searchEmoji(groups, '貓').map((e) => e.emoji)
    expect(cats).toContain('🐱')
    // 資料裡有些 emoji 帶著看不見的變體選擇符 U+FE0F，顯示一樣
    expect(searchEmoji(groups, '書').map((e) => e.emoji.replace(/\uFE0F/g, ''))).toContain('📚')
    expect(searchEmoji(groups, '🔥')[0].emoji).toBe('🔥')
    expect(searchEmoji(groups, '   ')).toEqual([])
  })
})
