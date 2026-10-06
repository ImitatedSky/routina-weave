import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { useNotes } from '@/store/notes'
import type { Note } from '@/notes/types'
import { linkInsertion, linkOptions, linkSource } from './linkCompletion'

function note(id: string, title: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    title,
    body: '',
    parent: null,
    order: 0,
    tags: [],
    props: {},
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
}

const notes: Record<string, Note> = Object.fromEntries(
  [
    note('work', '工作'),
    note('life', '生活'),
    note('a', '會議紀錄', { parent: 'work', updated: '2026-03-01T00:00:00.000Z' }),
    note('b', '會議紀錄', { parent: 'life', updated: '2026-02-01T00:00:00.000Z' }),
    note('c', '週會', { updated: '2026-05-01T00:00:00.000Z' }),
    note('tpl', '會議範本', { template: true }),
    note('react', 'React 筆記'),
  ].map((n) => [n.id, n]),
)

describe('linkOptions', () => {
  it('排除範本，同名的用上層路徑區分', () => {
    const options = linkOptions(notes, '會議')
    expect(options).toEqual([
      { title: '會議紀錄', detail: '工作' },
      { title: '會議紀錄', detail: '生活' },
      { title: '會議', create: true },
    ])
  })

  it('開頭相同的排在只有包含的前面', () => {
    const titles = linkOptions(notes, '會').map((o) => o.title)
    expect(titles.slice(0, 2)).toEqual(['會議紀錄', '會議紀錄'])
    expect(titles[2]).toBe('週會')
  })

  it('不分大小寫；已經有這個標題就不出現「建立新頁面」', () => {
    expect(linkOptions(notes, 'react 筆記')).toEqual([{ title: 'React 筆記', detail: undefined }])
  })

  it('沒打字時列出所有筆記、不出現「建立新頁面」', () => {
    const options = linkOptions(notes, '')
    expect(options).toHaveLength(6)
    expect(options.some((o) => o.create)).toBe(false)
  })

  it('找不到時只有「建立新頁面」', () => {
    expect(linkOptions(notes, ' 新點子 ')).toEqual([{ title: '新點子', create: true }])
  })
})

describe('linkInsertion', () => {
  it('後面沒有 ]] 就補上', () => {
    expect(linkInsertion('週會', ' 之後')).toEqual({ insert: '週會]]', replace: 0 })
  })

  it('後面已經有 ]] 不重複，打到一半的字一起換掉', () => {
    expect(linkInsertion('週會', ']] 之後')).toEqual({ insert: '週會]]', replace: 2 })
    expect(linkInsertion('週會', '會]]')).toEqual({ insert: '週會]]', replace: 3 })
  })

  it('有別名時只換標題', () => {
    expect(linkInsertion('週會', '|開會]]')).toEqual({ insert: '週會', replace: 0 })
  })

  it('後面的另一個連結不算', () => {
    expect(linkInsertion('週會', ' 和 [[別的]]')).toEqual({ insert: '週會]]', replace: 0 })
  })
})

describe('linkSource', () => {
  beforeEach(() => useNotes.setState({ notes }))

  function contextAt(doc: string) {
    const state = EditorState.create({ doc, extensions: markdown({ base: markdownLanguage }) })
    return new CompletionContext(state, doc.length, false)
  }

  it('打 [[ 之後從標題開始取代', () => {
    const result = linkSource(contextAt('看 [[週'))!
    expect(result.from).toBe(4)
    expect(result.options.map((o) => o.label)).toEqual(['週會', '建立新頁面：週'])
  })

  it('單一個 [ 或程式碼裡不跳', () => {
    expect(linkSource(contextAt('看 [週'))).toBeNull()
    expect(linkSource(contextAt('```\n[['))).toBeNull()
  })
})
