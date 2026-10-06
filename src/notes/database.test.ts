import { describe, expect, it } from 'vitest'
import type { Note, PropValue } from './types'
import {
  TITLE_KEY, collectFields, compareValues, fieldValues, filterNotes, formatValue, inferType, isRating,
  matchFilter, nextSort, parseInput, readTableState, removeProp, renameProp, sortNotes, writeTableState,
} from './database'

function note(title: string, props: Record<string, PropValue> = {}): Note {
  return {
    id: title,
    title,
    body: '',
    parent: 'books',
    order: 0,
    tags: [],
    props,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
  }
}

const books = [
  note('原子習慣', { 作者: 'James Clear', 狀態: '讀完', 評分: 5, 有紙本: true }),
  note('深度工作', { 作者: 'Cal Newport', 狀態: '閱讀中', 評分: 4 }),
  note('人類大歷史', { 作者: 'Yuval Noah Harari', 狀態: '想讀', 評分: 0 }),
  note('空白書', { 作者: '', 狀態: '想讀' }),
]

const titles = (list: Note[]) => list.map((n) => n.title)

describe('inferType', () => {
  it('只看非空值', () => {
    expect(inferType([1, '', undefined, 3])).toBe('number')
    expect(inferType([true, false])).toBe('checkbox')
    expect(inferType(['a', ''])).toBe('text')
  })

  it('混雜或沒有值時當文字', () => {
    expect(inferType([1, 'a'])).toBe('text')
    expect(inferType(['', undefined])).toBe('text')
    expect(inferType([])).toBe('text')
  })
})

describe('collectFields', () => {
  it('聯集所有欄位，用到的頁面多的在前，同數量照出現順序', () => {
    const fields = collectFields(books)
    expect(fields.map((f) => f.key)).toEqual(['作者', '狀態', '評分', '有紙本'])
    expect(fields.map((f) => f.type)).toEqual(['text', 'text', 'number', 'checkbox'])
    expect(fields[0].count).toBe(4)
    expect(fields[3].count).toBe(1)
  })
})

describe('fieldValues', () => {
  it('不重複、去空白、常用的在前', () => {
    expect(fieldValues(books, '狀態')).toEqual(['想讀', '讀完', '閱讀中'])
    expect(fieldValues(books, '評分')).toEqual([])
  })
})

describe('parseInput', () => {
  it('數字欄位轉成數字，空字串保留，亂打回傳 null', () => {
    expect(parseInput(' 4.5 ', 'number')).toBe(4.5)
    expect(parseInput('', 'number')).toBe('')
    expect(parseInput('abc', 'number')).toBeNull()
    expect(parseInput('1984', 'text')).toBe('1984')
  })
})

describe('renameProp / removeProp', () => {
  it('改名保留順序，撞名時不動', () => {
    const props = { a: 1, b: 2, c: 3 }
    expect(Object.keys(renameProp(props, 'b', 'x'))).toEqual(['a', 'x', 'c'])
    expect(renameProp(props, 'b', 'c')).toBe(props)
    expect(removeProp(props, 'b')).toEqual({ a: 1, c: 3 })
    expect(props).toEqual({ a: 1, b: 2, c: 3 })
  })
})

describe('isRating / formatValue', () => {
  it('評分欄位 0–5 的整數畫星星', () => {
    expect(isRating('評分', 3)).toBe(true)
    expect(isRating('評分', 7)).toBe(false)
    expect(isRating('數量', 3)).toBe(false)
    expect(formatValue('評分', 3)).toBe('★★★')
    expect(formatValue('評分', 0)).toBe('')
    expect(formatValue('數量', 3)).toBe('3')
    expect(formatValue('有紙本', true)).toBe('✓')
    expect(formatValue('有紙本', false)).toBe('')
  })
})

describe('compareValues', () => {
  it('數字照大小、布林 false 在前、字串照中文排序並認得數字', () => {
    expect(compareValues(2, 10)).toBeLessThan(0)
    expect(compareValues(false, true)).toBeLessThan(0)
    expect(compareValues('第2章', '第10章')).toBeLessThan(0)
  })
})

describe('sortNotes', () => {
  it('數字欄位升冪降冪，空值永遠最後', () => {
    expect(titles(sortNotes(books, { key: '評分', dir: 'asc' }))).toEqual(['人類大歷史', '深度工作', '原子習慣', '空白書'])
    expect(titles(sortNotes(books, { key: '評分', dir: 'desc' }))).toEqual(['原子習慣', '深度工作', '人類大歷史', '空白書'])
  })

  it('空字串也算空值', () => {
    expect(titles(sortNotes(books, { key: '作者', dir: 'desc' })).at(-1)).toBe('空白書')
  })

  it('可以依標題排序，不改原陣列', () => {
    const sorted = sortNotes(books, { key: TITLE_KEY, dir: 'asc' })
    expect(sorted).not.toBe(books)
    expect(sorted).toHaveLength(4)
    expect(titles(books)[0]).toBe('原子習慣')
  })

  it('沒有排序時原樣回傳', () => {
    expect(sortNotes(books, null)).toBe(books)
  })
})

describe('nextSort', () => {
  it('升冪 → 降冪 → 不排序', () => {
    expect(nextSort(null, '評分')).toEqual({ key: '評分', dir: 'asc' })
    expect(nextSort({ key: '評分', dir: 'asc' }, '評分')).toEqual({ key: '評分', dir: 'desc' })
    expect(nextSort({ key: '評分', dir: 'desc' }, '評分')).toBeNull()
    expect(nextSort({ key: '評分', dir: 'desc' }, '作者')).toEqual({ key: '作者', dir: 'asc' })
  })
})

describe('matchFilter / filterNotes', () => {
  it('包含不分大小寫', () => {
    expect(matchFilter(books[0], { key: '作者', op: 'contains', value: 'clear' })).toBe(true)
    expect(matchFilter(books[1], { key: '作者', op: 'contains', value: 'clear' })).toBe(false)
  })

  it('等於、不等於；不等於包含空值', () => {
    expect(titles(filterNotes(books, [{ key: '狀態', op: 'eq', value: '想讀' }]))).toEqual(['人類大歷史', '空白書'])
    expect(titles(filterNotes(books, [{ key: '評分', op: 'neq', value: '5' }]))).toEqual(['深度工作', '人類大歷史', '空白書'])
  })

  it('大於小於用數字比較，空值不算', () => {
    expect(titles(filterNotes(books, [{ key: '評分', op: 'gt', value: '3' }]))).toEqual(['原子習慣', '深度工作'])
    expect(titles(filterNotes(books, [{ key: '評分', op: 'lt', value: '10' }]))).toEqual(['原子習慣', '深度工作', '人類大歷史'])
  })

  it('勾選：沒有這個欄位算未勾選', () => {
    expect(titles(filterNotes(books, [{ key: '有紙本', op: 'checked', value: '' }]))).toEqual(['原子習慣'])
    expect(filterNotes(books, [{ key: '有紙本', op: 'unchecked', value: '' }])).toHaveLength(3)
  })

  it('空白、非空白', () => {
    expect(titles(filterNotes(books, [{ key: '作者', op: 'empty', value: '' }]))).toEqual(['空白書'])
    expect(filterNotes(books, [{ key: '評分', op: 'notEmpty', value: '' }])).toHaveLength(3)
  })

  it('條件值還沒填時不篩', () => {
    expect(filterNotes(books, [{ key: '作者', op: 'contains', value: ' ' }])).toHaveLength(4)
  })

  it('多個條件是 AND，也可以篩標題', () => {
    const result = filterNotes(books, [
      { key: '狀態', op: 'eq', value: '想讀' },
      { key: TITLE_KEY, op: 'contains', value: '歷史' },
    ])
    expect(titles(result)).toEqual(['人類大歷史'])
  })
})

describe('readTableState / writeTableState', () => {
  it('讀回寫進去的狀態', () => {
    const state = {
      sort: { key: '評分', dir: 'desc' as const },
      filters: [{ key: '狀態', op: 'eq' as const, value: '想讀' }],
    }
    expect(readTableState(writeTableState(undefined, state))).toEqual(state)
  })

  it('格式不對的部分忽略', () => {
    const state = readTableState({
      tableSort: { key: '評分', dir: 'up' },
      tableFilters: [
        { key: '評分', op: 'gt', value: 3 },
        { key: '', op: 'eq', value: 'x' },
        { key: '狀態', op: 'like', value: 'x' },
        'oops',
        { key: '作者', op: 'empty' },
      ],
    })
    expect(state.sort).toBeNull()
    expect(state.filters).toEqual([
      { key: '評分', op: 'gt', value: '3' },
      { key: '作者', op: 'empty', value: '' },
    ])
    expect(readTableState(undefined)).toEqual({ sort: null, filters: [] })
    expect(readTableState({ tableFilters: 'x' }).filters).toEqual([])
  })

  it('保留其他 extra 鍵，清空時移除自己的鍵', () => {
    const extra = { custom: 1, tableSort: { key: 'a', dir: 'asc' } }
    expect(writeTableState(extra, { sort: null, filters: [] })).toEqual({ custom: 1 })
    expect(writeTableState({ tableSort: { key: 'a', dir: 'asc' } }, { sort: null, filters: [] })).toBeUndefined()
    expect(extra.tableSort).toBeDefined()
  })
})
