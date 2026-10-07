import { describe, expect, it } from 'vitest'
import type { Note, PropValue } from './types'
import { fromMarkdown, toMarkdown } from './markdown'
import {
  CREATED_KEY, TITLE_KEY, UPDATED_KEY, formatDate, isDateText, parseDate, propTypeOf, readPropTypes, setPropType, typeOf,
  type TableFilter, collectFields, compareValues, fieldValues, filterNotes, formatValue, inferType, isRating,
  matchFilter, nextSort, parseInput, readTableState, removeProp, renameProp, sortNotes, writeTableState,
} from './database'

function note(title: string, props: Record<string, PropValue> = {}, fields: Partial<Note> = {}): Note {
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
    ...fields,
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
      columns: [UPDATED_KEY],
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
      tableColumns: ['$updated', 'nope', '$created', '$updated'],
    })
    expect(state.sort).toBeNull()
    expect(state.filters).toEqual([
      { key: '評分', op: 'gt', value: '3' },
      { key: '作者', op: 'empty', value: '' },
    ])
    expect(state.columns).toEqual([CREATED_KEY, UPDATED_KEY])
    expect(readTableState(undefined)).toEqual({ sort: null, filters: [], columns: [] })
    expect(readTableState({ tableFilters: 'x' }).filters).toEqual([])
  })

  it('保留其他 extra 鍵，清空時移除自己的鍵', () => {
    const extra = { custom: 1, tableSort: { key: 'a', dir: 'asc' } }
    expect(writeTableState(extra, { sort: null, filters: [], columns: [] })).toEqual({ custom: 1 })
    expect(writeTableState({ tableSort: { key: 'a', dir: 'asc' } }, { sort: null, filters: [], columns: [] })).toBeUndefined()
    expect(extra.tableSort).toBeDefined()
  })
})

// 測試裡的「現在」固定在 2026-10-07（週三）下午三點，當地時間
const NOW = new Date(2026, 9, 7, 15, 0)

describe('日期', () => {
  it('只認 YYYY-MM-DD 與 YYYY-MM-DD HH:mm，擋掉不存在的日期', () => {
    expect(isDateText('2026-10-07')).toBe(true)
    expect(isDateText('2026-10-07 14:30')).toBe(true)
    expect(isDateText('2026-02-30')).toBe(false)
    expect(isDateText('2026-10-07 24:00')).toBe(false)
    expect(isDateText('2026/10/07')).toBe(false)
    expect(isDateText('2026-10-07T14:30:00.000Z')).toBe(false)
    expect(typeOf('2026-10-07')).toBe('date')
    expect(typeOf('1984')).toBe('text')
  })

  it('解析成當地時間；ISO 時間也收', () => {
    expect(parseDate('2026-10-07')).toEqual(new Date(2026, 9, 7))
    expect(parseDate('2026-10-07 14:30')).toEqual(new Date(2026, 9, 7, 14, 30))
    expect(parseDate('2026-10-07T06:30:00.000Z')?.getTime()).toBe(Date.UTC(2026, 9, 7, 6, 30))
    expect(parseDate('明天')).toBeNull()
  })

  it('好讀的格式：今天、明天、昨天用相對字樣', () => {
    expect(formatDate('2026-10-07', NOW)).toBe('今天')
    expect(formatDate('2026-10-08 09:05', NOW)).toBe('明天 09:05')
    expect(formatDate('2026-10-06', NOW)).toBe('昨天')
    expect(formatDate('2026-10-14', NOW)).toBe('2026年10月14日（週三）')
    expect(formatDate('2025-01-05 14:30', NOW)).toBe('2025年1月5日（週日） 14:30')
    expect(formatDate('隨便', NOW)).toBeNull()
    expect(formatValue('截止日', '2026-10-09', NOW)).toBe('2026年10月9日（週五）')
  })

  it('推斷型別：日期與文字混在一起當文字，全部空值用記下的型別', () => {
    expect(inferType(['2026-10-07', '', '2026-10-08 10:00'])).toBe('date')
    expect(inferType(['2026-10-07', '明天'])).toBe('text')
    expect(inferType(['', undefined], 'date')).toBe('date')
    expect(inferType(['abc'], 'date')).toBe('text')
  })

  it('空值的型別：先看這頁記下的，再看同一層其他頁面', () => {
    const page = note('a', { 截止日: '', 備註: '' }, { extra: { propTypes: { 截止日: 'date' } } })
    expect(propTypeOf(page, '截止日')).toBe('date')
    expect(propTypeOf(page, '備註', { key: '備註', type: 'date', count: 2 })).toBe('date')
    expect(propTypeOf(page, '備註')).toBe('text')
    expect(propTypeOf({ ...page, props: { 截止日: 'x' } }, '截止日')).toBe('text')
  })

  it('collectFields：所有值都空時用頁面記下的型別', () => {
    const list = [
      note('a', { 截止日: '' }, { extra: { propTypes: { 截止日: 'date' } } }),
      note('b', { 截止日: '' }),
    ]
    expect(collectFields(list)[0].type).toBe('date')
  })

  it('setPropType 保留其他 extra 鍵，設回文字就移除', () => {
    const extra = setPropType({ custom: 1 }, '截止日', 'date')
    expect(extra).toEqual({ custom: 1, propTypes: { 截止日: 'date' } })
    expect(readPropTypes(extra)).toEqual({ 截止日: 'date' })
    expect(setPropType(extra, '截止日', undefined)).toEqual({ custom: 1 })
    expect(setPropType({ propTypes: { a: 'date' } }, 'a', 'text')).toBeUndefined()
    expect(readPropTypes({ propTypes: { a: 'weird', b: 'number' } })).toEqual({ b: 'number' })
  })

  it('匯出成 .md 再讀回來，日期仍是原樣的字串', () => {
    const page = note('a', { 截止日: '2026-10-07', 會議: '2026-10-07 14:30', 空: '' })
    const text = toMarkdown(page)
    const back = fromMarkdown(text)!
    expect(back.props).toEqual({ 截止日: '2026-10-07', 會議: '2026-10-07 14:30', 空: '' })
    expect(typeof back.props.截止日).toBe('string')
    expect(text).toContain('截止日: 2026-10-07\n')
  })
})

describe('日期排序', () => {
  it('依時間先後，只有日期的算當天 00:00，空值最後', () => {
    const list = [
      note('下午', { 日期: '2026-10-07 14:00' }),
      note('空', { 日期: '' }),
      note('當天', { 日期: '2026-10-07' }),
      note('前一天', { 日期: '2026-10-06 23:59' }),
    ]
    expect(titles(sortNotes(list, { key: '日期', dir: 'asc' }))).toEqual(['前一天', '當天', '下午', '空'])
    expect(titles(sortNotes(list, { key: '日期', dir: 'desc' }))).toEqual(['下午', '當天', '前一天', '空'])
  })

  it('建立時間用真正的時間比，不是字串比（時區不同時字串順序會錯）', () => {
    const list = [
      note('晚', {}, { created: '2026-10-06T20:00:00Z' }),
      note('早', {}, { created: '2026-10-07T01:00:00+08:00' }),
    ]
    expect(titles(sortNotes(list, { key: CREATED_KEY, dir: 'asc' }))).toEqual(['早', '晚'])
  })
})

describe('日期篩選', () => {
  const list = [
    note('上週日', { 日期: '2026-10-04' }),
    note('週一', { 日期: '2026-10-05 08:00' }),
    note('今天早上', { 日期: '2026-10-07 09:00' }),
    note('今天', { 日期: '2026-10-07' }),
    note('週日', { 日期: '2026-10-11 23:00' }),
    note('下週一', { 日期: '2026-10-12' }),
    note('八天後', { 日期: '2026-10-15' }),
    note('七天前', { 日期: '2026-09-30' }),
    note('八天前', { 日期: '2026-09-29 12:00' }),
    note('空', { 日期: '' }),
    note('不是日期', { 日期: '明天' }),
  ]
  const run = (op: TableFilter['op'], value = '') => titles(filterNotes(list, [{ key: '日期', op, value }], NOW))

  it('是、早於、晚於以天為單位', () => {
    expect(run('on', '2026-10-07')).toEqual(['今天早上', '今天'])
    expect(run('before', '2026-10-05')).toEqual(['上週日', '七天前', '八天前'])
    expect(run('after', '2026-10-11')).toEqual(['下週一', '八天後'])
  })

  it('條件日期還沒選時不篩', () => {
    expect(run('on')).toHaveLength(list.length)
  })

  it('今天、本週內（週一到週日）', () => {
    expect(run('today')).toEqual(['今天早上', '今天'])
    expect(run('thisWeek')).toEqual(['週一', '今天早上', '今天', '週日'])
  })

  it('過去 7 天、未來 7 天都含今天', () => {
    expect(run('past7')).toEqual(['上週日', '週一', '今天早上', '今天', '七天前'])
    expect(run('next7')).toEqual(['今天早上', '今天', '週日', '下週一'])
  })

  it('空白、非空白', () => {
    expect(run('empty')).toEqual(['空'])
    expect(run('notEmpty')).toHaveLength(list.length - 1)
  })

  it('建立時間也能用日期條件', () => {
    const pages = [note('今天建立', {}, { created: new Date(2026, 9, 7, 10).toISOString() }), note('舊的', {})]
    expect(titles(filterNotes(pages, [{ key: CREATED_KEY, op: 'today', value: '' }], NOW))).toEqual(['今天建立'])
  })
})
