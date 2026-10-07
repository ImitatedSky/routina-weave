import type { Note, PropValue } from './types'

/**
 * 精簡資料庫：子頁面的 props 就是欄位。這裡只放純邏輯
 * （欄位推斷、日期、排序、篩選、表格狀態讀寫），介面在 components/database。
 */

export type FieldType = 'text' | 'number' | 'checkbox' | 'date'

export interface Field {
  key: string
  type: FieldType
  /** 有幾個頁面用到這個欄位 */
  count: number
}

/** 排序與篩選裡代表「標題」欄的鍵，避免跟使用者自己的屬性撞名 */
export const TITLE_KEY = '$title'
/** 表格可以多顯示的唯讀欄位，直接讀 note.created / note.updated，不寫進 props */
export const CREATED_KEY = '$created'
export const UPDATED_KEY = '$updated'
export const BUILTIN_COLUMNS = [
  { key: CREATED_KEY, label: '建立時間' },
  { key: UPDATED_KEY, label: '最後編輯' },
]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: '文字',
  number: '數字',
  checkbox: '勾選',
  date: '日期',
}

export function columnLabel(key: string): string {
  if (key === TITLE_KEY) return '標題'
  return BUILTIN_COLUMNS.find((c) => c.key === key)?.label ?? key
}

export function isEmpty(value: PropValue | undefined): boolean {
  return value === undefined || (typeof value === 'string' && value.trim() === '')
}

// ── 日期 ──────────────────────────────────────────────
// 屬性裡的日期就是字串：YYYY-MM-DD 或 YYYY-MM-DD HH:mm，都是裝置當地時間。
// 這樣 frontmatter 裡看得懂，yaml 也不會把它轉成別的型別。

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/

/** 解析屬性的日期字串；也收 note.created 那種 ISO 時間。不是日期回傳 null */
export function parseDate(text: string): Date | null {
  const m = DATE_TEXT.exec(text)
  if (m) {
    const [year, month, day, hour, minute] = m.slice(1).map((s) => (s === undefined ? 0 : Number(s)))
    if (hour > 23 || minute > 59) return null
    const date = new Date(year, month - 1, day, hour, minute)
    // 2026-02-30 這種會被 Date 自動進位，要擋掉
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null
    return date
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(text)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

/** 屬性值是不是日期（只認兩種固定格式，ISO 時間不算） */
export function isDateText(text: string): boolean {
  return DATE_TEXT.test(text) && parseDate(text) !== null
}

export function hasTime(text: string): boolean {
  return text.includes(' ') || text.includes('T')
}

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateText(date: Date, withTime = false): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

const WEEKDAYS = '日一二三四五六'
const RELATIVE_DAYS: Record<number, string> = { [-1]: '昨天', 0: '今天', 1: '明天' }

/** 好讀的日期：今天、明天、昨天，其他是「2026年10月7日（週三）」；有時間就接「 14:30」 */
export function formatDate(text: string, now = new Date()): string | null {
  const date = parseDate(text)
  if (!date) return null
  // 用 round：遇到日光節約時間，一天不一定剛好 24 小時
  const diff = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000)
  const day =
    RELATIVE_DAYS[diff] ??
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（週${WEEKDAYS[date.getDay()]}）`
  return hasTime(text) ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day
}

// ── 型別 ──────────────────────────────────────────────

export function typeOf(value: PropValue): FieldType {
  if (typeof value === 'boolean') return 'checkbox'
  if (typeof value === 'number') return 'number'
  if (isDateText(value)) return 'date'
  return 'text'
}

/**
 * 只看非空值：全部同一種就是那一種，混雜當文字。
 * 全部都是空值時沒得推斷，用 fallback（例如新增屬性時記下的型別）。
 */
export function inferType(values: (PropValue | undefined)[], fallback: FieldType = 'text'): FieldType {
  const types = new Set<FieldType>()
  for (const value of values) {
    if (!isEmpty(value)) types.add(typeOf(value!))
  }
  if (types.size === 0) return fallback
  return types.size === 1 ? [...types][0] : 'text'
}

/**
 * 空字串看不出是日期還是文字，所以新增屬性時把型別記在這頁的 extra.propTypes：
 *   propTypes: { 截止日: 'date' }
 * 只在值是空的時候參考。文字是預設，不記。
 */
export function readPropTypes(extra: Record<string, unknown> | undefined): Record<string, FieldType> {
  const raw = extra?.propTypes
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, FieldType> = {}
  for (const [key, type] of Object.entries(raw)) {
    if (type === 'number' || type === 'checkbox' || type === 'date') out[key] = type
  }
  return out
}

/** 設定或移除（type 給 undefined 或 text）某個欄位記下的型別，保留其他 extra 鍵 */
export function setPropType(
  extra: Record<string, unknown> | undefined,
  key: string,
  type: FieldType | undefined,
): Record<string, unknown> | undefined {
  const types = readPropTypes(extra)
  if (type && type !== 'text') types[key] = type
  else delete types[key]
  const out = { ...extra }
  if (Object.keys(types).length) out.propTypes = types
  else delete out.propTypes
  return Object.keys(out).length ? out : undefined
}

/** 某一頁某個欄位的型別：有值看值；空值看這頁記下的型別，再看同一層其他頁面 */
export function propTypeOf(note: Note, key: string, siblingField?: Field): FieldType {
  const value = note.props[key]
  if (!isEmpty(value)) return typeOf(value)
  return readPropTypes(note.extra)[key] ?? siblingField?.type ?? 'text'
}

/** 所有頁面 props 的聯集，用到的頁面多的排前面；一樣多就照第一次出現的順序 */
export function collectFields(notes: Note[]): Field[] {
  const values = new Map<string, PropValue[]>()
  const hints = new Map<string, FieldType>()
  for (const note of notes) {
    const types = readPropTypes(note.extra)
    for (const [key, value] of Object.entries(note.props)) {
      if (!values.has(key)) values.set(key, [])
      values.get(key)!.push(value)
      if (types[key] && !hints.has(key)) hints.set(key, types[key])
    }
  }
  return [...values]
    .map(([key, list]) => ({ key, type: inferType(list, hints.get(key)), count: list.length }))
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
  if (key === TITLE_KEY) return note.title
  if (key === CREATED_KEY) return note.created
  if (key === UPDATED_KEY) return note.updated
  return note.props[key]
}

/** 新增欄位時的初始值。數字給 0；日期給空字串，型別另外記在 propTypes */
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
export function formatValue(key: string, value: PropValue | undefined, now = new Date()): string {
  if (value === undefined) return ''
  if (typeof value === 'boolean') return value ? '✓' : ''
  if (typeof value === 'number' && isRating(key, value)) return value > 0 ? '★'.repeat(value) : ''
  if (typeof value === 'string') return formatDate(value, now) ?? value
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
  // 兩邊都是日期就比時間先後；只有日期的算當天 00:00
  if (typeof a === 'string' && typeof b === 'string') {
    const dateA = parseDate(a)
    const dateB = parseDate(b)
    if (dateA && dateB) return dateA.getTime() - dateB.getTime()
  }
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

export type FilterOp =
  | 'contains' | 'eq' | 'neq' | 'gt' | 'lt' | 'checked' | 'unchecked' | 'empty' | 'notEmpty'
  | 'on' | 'before' | 'after' | 'today' | 'thisWeek' | 'past7' | 'next7'

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
  on: '是',
  before: '早於',
  after: '晚於',
  today: '今天',
  thisWeek: '本週內',
  past7: '過去 7 天',
  next7: '未來 7 天',
}

const FILTER_OPS = Object.keys(FILTER_OP_LABELS) as FilterOp[]

/** 每種欄位可以用的條件，第一個是預設 */
export function opsFor(type: FieldType): FilterOp[] {
  if (type === 'checkbox') return ['checked', 'unchecked']
  if (type === 'number') return ['eq', 'neq', 'gt', 'lt', 'empty', 'notEmpty']
  if (type === 'date') return ['on', 'before', 'after', 'today', 'thisWeek', 'past7', 'next7', 'empty', 'notEmpty']
  return ['contains', 'eq', 'neq', 'empty', 'notEmpty']
}

export function needsValue(op: FilterOp): boolean {
  return ['contains', 'eq', 'neq', 'gt', 'lt', 'on', 'before', 'after'].includes(op)
}

/** now 給測試固定「現在」用；今天、本週都照裝置當地時間算 */
export function matchFilter(note: Note, filter: TableFilter, now = new Date()): boolean {
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
    case 'on':
    case 'before':
    case 'after':
    case 'today':
    case 'thisWeek':
    case 'past7':
    case 'next7':
      return matchDate(filter, value, now)
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

/** 日期條件以「天」為單位，跟 Notion 一樣：晚於 10/7 是 10/8 起 */
function matchDate(filter: TableFilter, value: PropValue | undefined, now: Date): boolean {
  let day: Date | null = null
  if (needsValue(filter.op)) {
    day = parseDate(filter.value.trim())
    // 條件日期還沒選就先不篩
    if (!day) return true
    day = startOfDay(day)
  }
  const date = typeof value === 'string' ? parseDate(value) : null
  if (!date) return false

  const time = date.getTime()
  const between = (from: Date, to: Date) => time >= from.getTime() && time < to.getTime()
  const today = startOfDay(now)
  switch (filter.op) {
    case 'on':
      return between(day!, addDays(day!, 1))
    case 'before':
      return time < day!.getTime()
    case 'after':
      return time >= addDays(day!, 1).getTime()
    case 'today':
      return between(today, addDays(today, 1))
    case 'thisWeek': {
      // 一週從週一開始
      const monday = addDays(today, -((today.getDay() + 6) % 7))
      return between(monday, addDays(monday, 7))
    }
    case 'past7':
      // 七天前到今天，都含
      return between(addDays(today, -7), addDays(today, 1))
    case 'next7':
      return between(today, addDays(today, 8))
    default:
      return false
  }
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
export function filterNotes(notes: Note[], filters: TableFilter[], now = new Date()): Note[] {
  if (!filters.length) return notes
  return notes.filter((note) => filters.every((f) => matchFilter(note, f, now)))
}

// ── 表格狀態存在上層頁面 frontmatter 的 extra ─────────────

export interface TableState {
  sort: TableSort | null
  filters: TableFilter[]
  /** 要顯示的唯讀欄位（BUILTIN_COLUMNS 的 key），預設都不顯示 */
  columns: string[]
}

/**
 * extra 來自使用者的 .md 檔，可能被手動改壞，格式不對的部分直接忽略：
 *   tableSort:    { key: string, dir: 'asc' | 'desc' }
 *   tableFilters: [{ key: string, op: FilterOp, value: string }]
 *   tableColumns: ['$created', '$updated']
 */
export function readTableState(extra: Record<string, unknown> | undefined): TableState {
  return {
    sort: readSort(extra?.tableSort),
    filters: readFilters(extra?.tableFilters),
    columns: readColumns(extra?.tableColumns),
  }
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

function readColumns(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  // 照 BUILTIN_COLUMNS 的順序，順便去掉重複與不認得的
  return BUILTIN_COLUMNS.map((c) => c.key).filter((key) => raw.includes(key))
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
  if (state.columns.length) out.tableColumns = [...state.columns]
  else delete out.tableColumns
  return Object.keys(out).length ? out : undefined
}
