import type { Note, PropValue } from './types'

/**
 * 精簡資料庫：子頁面的 props 就是欄位。這裡只放純邏輯
 * （欄位推斷、排序、篩選、表格狀態讀寫），介面在 components/database。
 */

export type FieldType = 'text' | 'number' | 'checkbox'

export interface Field {
  key: string
  type: FieldType
  /** 有幾個頁面用到這個欄位 */
  count: number
}

/** 排序與篩選裡代表「標題」欄的鍵，避免跟使用者自己的屬性撞名 */
export const TITLE_KEY = '$title'

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: '文字',
  number: '數字',
  checkbox: '勾選',
}

export function isEmpty(value: PropValue | undefined): boolean {
  return value === undefined || (typeof value === 'string' && value.trim() === '')
}

export function typeOf(value: PropValue): FieldType {
  if (typeof value === 'boolean') return 'checkbox'
  if (typeof value === 'number') return 'number'
  return 'text'
}

/** 只看非空值：全部是布林就是勾選、全部是數字就是數字，混雜或沒有值當文字 */
export function inferType(values: (PropValue | undefined)[]): FieldType {
  const types = new Set<FieldType>()
  for (const value of values) {
    if (!isEmpty(value)) types.add(typeOf(value!))
  }
  return types.size === 1 ? [...types][0] : 'text'
}

/** 所有頁面 props 的聯集，用到的頁面多的排前面；一樣多就照第一次出現的順序 */
export function collectFields(notes: Note[]): Field[] {
  const values = new Map<string, PropValue[]>()
  for (const note of notes) {
    for (const [key, value] of Object.entries(note.props)) {
      if (!values.has(key)) values.set(key, [])
      values.get(key)!.push(value)
    }
  }
  return [...values]
    .map(([key, list]) => ({ key, type: inferType(list), count: list.length }))
    .sort((a, b) => b.count - a.count)
}

/** 某個欄位用過的文字值，常用的在前。當作 select 的建議選項 */
export function fieldValues(notes: Note[], key: string): string[] {
  const counts = new Map<string, number>()
  for (const note of notes) {
    const value = note.props[key]
    if (typeof value !== 'string' || value.trim() === '') continue
    const text = value.trim()
    counts.set(text, (counts.get(text) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([text]) => text)
}

export function valueOf(note: Note, key: string): PropValue | undefined {
  return key === TITLE_KEY ? note.title : note.props[key]
}

/** 新增欄位時的初始值。數字給 0，空字串會被推斷成文字 */
export function defaultValue(type: FieldType): PropValue {
  if (type === 'number') return 0
  if (type === 'checkbox') return false
  return ''
}

/** 使用者輸入的文字轉成欄位值；數字欄位打了不是數字的東西回傳 null */
export function parseInput(text: string, type: FieldType): PropValue | null {
  if (type !== 'number') return text
  const trimmed = text.trim()
  if (trimmed === '') return ''
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

/** 改欄位名，保留欄位順序。新名字已經存在時不動 */
export function renameProp(props: Record<string, PropValue>, from: string, to: string): Record<string, PropValue> {
  if (from === to || !(from in props) || to in props) return props
  const out: Record<string, PropValue> = {}
  for (const [key, value] of Object.entries(props)) {
    out[key === from ? to : key] = value
  }
  return out
}

export function removeProp(props: Record<string, PropValue>, key: string): Record<string, PropValue> {
  const out = { ...props }
  delete out[key]
  return out
}

/** 名字像評分、值是 0–5 的整數才畫星星 */
export function isRating(key: string, value: PropValue | undefined): boolean {
  if (!/評分|rating/i.test(key)) return false
  return value === '' || value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5)
}

/** 清單、卡片、表格裡顯示用的文字 */
export function formatValue(key: string, value: PropValue | undefined): string {
  if (value === undefined) return ''
  if (typeof value === 'boolean') return value ? '✓' : ''
  if (typeof value === 'number' && isRating(key, value)) return value > 0 ? '★'.repeat(value) : ''
  return String(value)
}

// ── 排序 ──────────────────────────────────────────────

export type SortDir = 'asc' | 'desc'

export interface TableSort {
  key: string
  dir: SortDir
}

export function compareValues(a: PropValue, b: PropValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'zh-Hant', { numeric: true })
}

/** 回傳新陣列。空值不管升冪降冪都排最後 */
export function sortNotes(notes: Note[], sort: TableSort | null): Note[] {
  if (!sort) return notes
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...notes].sort((x, y) => {
    const a = valueOf(x, sort.key)
    const b = valueOf(y, sort.key)
    const emptyA = isEmpty(a)
    const emptyB = isEmpty(b)
    if (emptyA || emptyB) return Number(emptyA) - Number(emptyB)
    return sign * compareValues(a!, b!)
  })
}

/** 點欄位標題：不排序 → 升冪 → 降冪 → 不排序 */
export function nextSort(current: TableSort | null, key: string): TableSort | null {
  if (!current || current.key !== key) return { key, dir: 'asc' }
  if (current.dir === 'asc') return { key, dir: 'desc' }
  return null
}

// ── 篩選 ──────────────────────────────────────────────

export type FilterOp = 'contains' | 'eq' | 'neq' | 'gt' | 'lt' | 'checked' | 'unchecked' | 'empty' | 'notEmpty'

export interface TableFilter {
  key: string
  op: FilterOp
  value: string
}

export const FILTER_OP_LABELS: Record<FilterOp, string> = {
  contains: '包含',
  eq: '等於',
  neq: '不等於',
  gt: '大於',
  lt: '小於',
  checked: '已勾選',
  unchecked: '未勾選',
  empty: '空白',
  notEmpty: '非空白',
}

const FILTER_OPS = Object.keys(FILTER_OP_LABELS) as FilterOp[]

/** 每種欄位可以用的條件，第一個是預設 */
export function opsFor(type: FieldType): FilterOp[] {
  if (type === 'checkbox') return ['checked', 'unchecked']
  if (type === 'number') return ['eq', 'neq', 'gt', 'lt', 'empty', 'notEmpty']
  return ['contains', 'eq', 'neq', 'empty', 'notEmpty']
}

export function needsValue(op: FilterOp): boolean {
  return op === 'contains' || op === 'eq' || op === 'neq' || op === 'gt' || op === 'lt'
}

export function matchFilter(note: Note, filter: TableFilter): boolean {
  const value = valueOf(note, filter.key)
  switch (filter.op) {
    case 'empty':
      return isEmpty(value)
    case 'notEmpty':
      return !isEmpty(value)
    case 'checked':
      return value === true
    case 'unchecked':
      return value !== true
  }

  const target = filter.value.trim()
  // 條件值還沒填就先不篩，不然一新增條件整張表就空了
  if (target === '') return true
  if (filter.op === 'neq') return !equals(value, target)
  if (filter.op === 'eq') return equals(value, target)
  if (isEmpty(value)) return false
  if (filter.op === 'contains') return String(value).toLowerCase().includes(target.toLowerCase())
  const diff = compareToTarget(value!, target)
  return filter.op === 'gt' ? diff > 0 : diff < 0
}

function equals(value: PropValue | undefined, target: string): boolean {
  if (isEmpty(value)) return false
  const num = Number(target)
  if (typeof value === 'number' && Number.isFinite(num)) return value === num
  return String(value).trim().toLowerCase() === target.toLowerCase()
}

function compareToTarget(value: PropValue, target: string): number {
  const num = Number(target)
  if (typeof value === 'number' && Number.isFinite(num)) return value - num
  return String(value).localeCompare(target, 'zh-Hant', { numeric: true })
}

/** 多個條件之間是 AND */
export function filterNotes(notes: Note[], filters: TableFilter[]): Note[] {
  if (!filters.length) return notes
  return notes.filter((note) => filters.every((f) => matchFilter(note, f)))
}

// ── 表格狀態存在上層頁面 frontmatter 的 extra ─────────────

export interface TableState {
  sort: TableSort | null
  filters: TableFilter[]
}

/**
 * extra 來自使用者的 .md 檔，可能被手動改壞，格式不對的部分直接忽略：
 *   tableSort:    { key: string, dir: 'asc' | 'desc' }
 *   tableFilters: [{ key: string, op: FilterOp, value: string }]
 */
export function readTableState(extra: Record<string, unknown> | undefined): TableState {
  return { sort: readSort(extra?.tableSort), filters: readFilters(extra?.tableFilters) }
}

function readSort(raw: unknown): TableSort | null {
  if (!raw || typeof raw !== 'object') return null
  const { key, dir } = raw as Record<string, unknown>
  if (typeof key !== 'string' || key === '') return null
  if (dir !== 'asc' && dir !== 'desc') return null
  return { key, dir }
}

function readFilters(raw: unknown): TableFilter[] {
  if (!Array.isArray(raw)) return []
  const out: TableFilter[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { key, op, value } = item as Record<string, unknown>
    if (typeof key !== 'string' || key === '') continue
    if (!FILTER_OPS.includes(op as FilterOp)) continue
    // YAML 會把 value: 5 讀成數字
    const text = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
    out.push({ key, op: op as FilterOp, value: text })
  }
  return out
}

/** 回傳新的 extra，保留其他鍵；沒有排序篩選就不寫，frontmatter 保持乾淨 */
export function writeTableState(
  extra: Record<string, unknown> | undefined,
  state: TableState,
): Record<string, unknown> | undefined {
  const out = { ...extra }
  if (state.sort) out.tableSort = { key: state.sort.key, dir: state.sort.dir }
  else delete out.tableSort
  if (state.filters.length) out.tableFilters = state.filters.map((f) => ({ key: f.key, op: f.op, value: f.value }))
  else delete out.tableFilters
  return Object.keys(out).length ? out : undefined
}
