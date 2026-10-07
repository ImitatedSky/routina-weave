import { useMemo, useState } from 'react'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { ArrowDown, ArrowUp, Check, Columns3, ListFilter, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/menu'
import { useNotes } from '@/store/notes'
import { navigate } from '@/store/route'
import { NoteIcon } from '@/components/common/Thumbnail'
import {
  BUILTIN_COLUMNS, FILTER_OP_LABELS, TITLE_KEY, collectFields, columnLabel, defaultValue, fieldValues, filterNotes,
  formatDate, formatValue, needsValue, nextSort, opsFor, readTableState, setPropType, sortNotes,
  valueOf, writeTableState,
  type Field, type FieldType, type TableFilter, type TableState,
} from '@/notes/database'
import type { Note, PropValue } from '@/notes/types'
import { CheckboxInput, NumberInput, TextInput } from './inputs'
import { DateInput } from './DateInput'
import { AddPropertyDialog } from './PropertyDialogs'
import { cn } from '@/lib/utils'

/** 表格視圖：欄位是所有子頁面 props 的聯集。排序篩選存在上層頁面的 extra，匯出也帶著走 */
export function TableView({ parent, items }: { parent: Note; items: Note[] }) {
  const updateNote = useNotes((s) => s.updateNote)
  const fields = useMemo(() => collectFields(items), [items])
  const state = readTableState(parent.extra)
  const rows = sortNotes(filterNotes(items, state.filters), state.sort)
  const [showFilters, setShowFilters] = useState(false)
  const [addingField, setAddingField] = useState(false)

  const builtins: Field[] = state.columns.map((key) => ({ key, type: 'date', count: items.length }))
  // 唯讀欄位沒顯示也可以拿來篩選
  const filterFields: Field[] = [...fields, ...BUILTIN_COLUMNS.map((c) => ({ key: c.key, type: 'date' as const, count: 0 }))]

  const save = (next: TableState) => updateNote(parent.id, { extra: writeTableState(parent.extra, next) })
  const setFilters = (filters: TableFilter[]) => save({ ...state, filters })

  const addFilter = () => {
    const field = fields[0]
    setFilters([...state.filters, { key: field ? field.key : TITLE_KEY, op: opsFor(field ? field.type : 'text')[0], value: '' }])
    setShowFilters(true)
  }

  // 新欄位寫進每一個子頁面，表格才看得到；型別記在 propTypes，空的日期欄才認得出來
  const addField = (name: string, type: FieldType) => {
    for (const item of items) {
      if (name in item.props) continue
      updateNote(item.id, {
        props: { ...item.props, [name]: defaultValue(type) },
        extra: setPropType(item.extra, name, type),
      })
    }
  }

  // 照 BUILTIN_COLUMNS 的順序存，切換顯示時欄位不會跳來跳去
  const toggleColumn = (key: string, shown: boolean) => {
    const columns = BUILTIN_COLUMNS.map((c) => c.key).filter((k) => (k === key ? shown : state.columns.includes(k)))
    save({ ...state, columns })
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Button
          variant={state.filters.length ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => (state.filters.length ? setShowFilters(!showFilters) : addFilter())}
          aria-expanded={state.filters.length ? showFilters : undefined}
        >
          <ListFilter />
          篩選{state.filters.length > 0 && `（${state.filters.length}）`}
        </Button>
        {state.sort && (
          <Button variant="secondary" size="sm" onClick={() => save({ ...state, sort: null })} aria-label="取消排序">
            {state.sort.dir === 'asc' ? <ArrowUp /> : <ArrowDown />}
            {columnLabel(state.sort.key)}
            <X className="text-muted-foreground" />
          </Button>
        )}
        {state.filters.length > 0 && rows.length !== items.length && (
          <span className="text-xs text-muted-foreground">
            顯示 {rows.length} / {items.length}
          </span>
        )}
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" />}>
            <Columns3 />
            欄位
          </MenuTrigger>
          <MenuContent>
            <div className="px-2 py-1 text-xs text-muted-foreground">顯示唯讀欄位</div>
            {BUILTIN_COLUMNS.map((c) => (
              <MenuPrimitive.CheckboxItem
                key={c.key}
                checked={state.columns.includes(c.key)}
                onCheckedChange={(checked) => toggleColumn(c.key, checked)}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted pointer-coarse:py-2.5"
              >
                <span className="flex size-4 items-center justify-center">
                  <MenuPrimitive.CheckboxItemIndicator>
                    <Check className="size-4" />
                  </MenuPrimitive.CheckboxItemIndicator>
                </span>
                {c.label}
              </MenuPrimitive.CheckboxItem>
            ))}
          </MenuContent>
        </Menu>
      </div>

      {showFilters && state.filters.length > 0 && (
        <div className="mb-3 grid gap-2 rounded-lg border p-2">
          {state.filters.map((filter, i) => (
            <FilterRow
              key={i}
              filter={filter}
              fields={filterFields}
              onChange={(next) => setFilters(state.filters.map((f, j) => (j === i ? next : f)))}
              onRemove={() => setFilters(state.filters.filter((_, j) => j !== i))}
            />
          ))}
          <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={addFilter}>
            <Plus />
            新增條件
          </Button>
        </div>
      )}

      {/* 手機上整張表貼齊螢幕左右邊，第一欄固定，其他欄水平捲動 */}
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-y border-r bg-background p-0 pl-2 text-left font-normal sm:pl-0">
                <SortHeader label="標題" sortKey={TITLE_KEY} state={state} onSort={(sort) => save({ ...state, sort })} />
              </th>
              {[...fields, ...builtins].map((f) => (
                <th key={f.key} className="min-w-28 border-y p-0 text-left font-normal">
                  <SortHeader label={columnLabel(f.key)} sortKey={f.key} state={state} onSort={(sort) => save({ ...state, sort })} />
                </th>
              ))}
              <th className="w-full border-y p-0 text-left">
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => setAddingField(true)} aria-label="新增欄位">
                  <Plus />
                </Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="sticky left-0 z-10 border-b border-r bg-background p-0 pl-2 sm:pl-0">
                  <button
                    onClick={() => navigate({ kind: 'page', id: row.id })}
                    className="flex h-8 w-40 items-center gap-1.5 px-2 text-left font-medium hover:bg-muted pointer-coarse:h-10 sm:w-56"
                  >
                    <NoteIcon note={row} className="w-4" />
                    <span className="truncate">{row.title || '未命名'}</span>
                  </button>
                </td>
                {fields.map((f) => (
                  <td key={f.key} className="border-b p-0">
                    <Cell note={row} field={f} suggestions={f.type === 'text' ? fieldValues(items, f.key) : []} />
                  </td>
                ))}
                {builtins.map((f) => (
                  <td key={f.key} className="border-b px-2 whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatDate(String(valueOf(row, f.key)))}
                  </td>
                ))}
                <td className="border-b" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="py-3 text-center text-sm text-muted-foreground">沒有符合條件的頁面</p>}

      <AddPropertyDialog
        open={addingField}
        onOpenChange={setAddingField}
        existing={fields.map((f) => f.key)}
        onAdd={addField}
      />
    </div>
  )
}

function SortHeader({
  label,
  sortKey,
  state,
  onSort,
}: {
  label: string
  sortKey: string
  state: TableState
  onSort: (sort: TableState['sort']) => void
}) {
  const dir = state.sort?.key === sortKey ? state.sort.dir : null
  return (
    <button
      onClick={() => onSort(nextSort(state.sort, sortKey))}
      className={cn(
        'flex h-8 w-full items-center gap-1 px-2 text-xs whitespace-nowrap text-muted-foreground hover:bg-muted pointer-coarse:h-10',
        dir && 'text-foreground',
      )}
      aria-label={`依「${label}」排序`}
    >
      <span className="truncate">{label}</span>
      {dir === 'asc' && <ArrowUp className="size-3 shrink-0" />}
      {dir === 'desc' && <ArrowDown className="size-3 shrink-0" />}
    </button>
  )
}

/** 點一下變輸入框，Enter 或離開寫回；勾選欄位直接點 */
function Cell({ note, field, suggestions }: { note: Note; field: Field; suggestions: string[] }) {
  const updateNote = useNotes((s) => s.updateNote)
  const [editing, setEditing] = useState(false)
  const value = note.props[field.key]

  const set = (next: PropValue) => {
    // 這頁原本沒有這個欄位、也沒填東西，就不要多寫一個空欄位
    if (value === undefined && next === '') return
    updateNote(note.id, { props: { ...note.props, [field.key]: next } })
  }

  if (field.type === 'checkbox') {
    return <CheckboxInput checked={value === true} onChange={set} label={`${note.title} 的${field.key}`} />
  }
  if (field.type === 'date') {
    return (
      <DateInput
        value={value === undefined ? '' : String(value)}
        onCommit={set}
        label={`${note.title} 的${field.key}`}
        placeholder=""
        className="max-w-60 rounded-none"
      />
    )
  }

  if (editing) {
    const common = { autoFocus: true, onDone: () => setEditing(false), label: `${note.title} 的${field.key}` }
    return field.type === 'number' ? (
      <NumberInput value={typeof value === 'number' ? value : ''} onCommit={set} className="rounded-none" {...common} />
    ) : (
      <TextInput value={value === undefined ? '' : String(value)} suggestions={suggestions} onCommit={set} className="rounded-none" {...common} />
    )
  }

  const text = formatValue(field.key, value)
  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        'block h-8 w-full max-w-60 truncate px-2 text-left hover:bg-muted pointer-coarse:h-10',
        field.type === 'number' && 'tabular-nums',
      )}
      aria-label={`編輯 ${note.title} 的${field.key}`}
    >
      {text}
    </button>
  )
}

function FilterRow({
  filter,
  fields,
  onChange,
  onRemove,
}: {
  filter: TableFilter
  fields: Field[]
  onChange: (filter: TableFilter) => void
  onRemove: () => void
}) {
  const typeOfKey = (key: string): FieldType => fields.find((f) => f.key === key)?.type ?? 'text'
  const type = typeOfKey(filter.key)
  const ops = opsFor(type)
  // 手動改過 .md 或欄位型別變了，條件可能不在清單裡，照樣顯示出來
  const opOptions = ops.includes(filter.op) ? ops : [filter.op, ...ops]
  // 欄位被刪掉後條件還在，選單裡也要看得到它
  const missing = filter.key !== TITLE_KEY && !fields.some((f) => f.key === filter.key)

  // 換成不同型別的欄位時，條件值（例如文字換成日期）不能沿用
  const changeKey = (key: string) => {
    const nextType = typeOfKey(key)
    const nextOps = opsFor(nextType)
    const op = nextOps.includes(filter.op) ? filter.op : nextOps[0]
    onChange({ key, op, value: needsValue(op) && nextType === type ? filter.value : '' })
  }

  const selectClass =
    'h-8 min-w-0 flex-1 basis-24 rounded-md border bg-background px-2 text-sm outline-none focus:border-ring pointer-coarse:h-10'

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={filter.key} onChange={(e) => changeKey(e.target.value)} aria-label="篩選欄位" className={selectClass}>
        <option value={TITLE_KEY}>標題</option>
        {fields.map((f) => (
          <option key={f.key} value={f.key}>{columnLabel(f.key)}</option>
        ))}
        {missing && <option value={filter.key}>{filter.key}</option>}
      </select>
      <select
        value={filter.op}
        onChange={(e) => {
          const op = e.target.value as TableFilter['op']
          onChange({ ...filter, op, value: needsValue(op) ? filter.value : '' })
        }}
        aria-label="條件"
        className={selectClass}
      >
        {opOptions.map((op) => (
          <option key={op} value={op}>{FILTER_OP_LABELS[op]}</option>
        ))}
      </select>
      {needsValue(filter.op) && (
        <input
          type={type === 'date' ? 'date' : 'text'}
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          inputMode={type === 'number' ? 'decimal' : undefined}
          placeholder="值"
          aria-label="條件值"
          className="h-8 min-w-0 flex-1 basis-24 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring pointer-coarse:h-10"
        />
      )}
      <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={onRemove} aria-label="移除條件">
        <X />
      </Button>
    </div>
  )
}
