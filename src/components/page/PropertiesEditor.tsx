import { useMemo, useState } from 'react'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { useNotes, childrenOf } from '@/store/notes'
import {
  collectFields, defaultValue, fieldValues, isRating, removeProp, renameProp, typeOf, type Field,
} from '@/notes/database'
import { CheckboxInput, NumberInput, StarRating, TextInput } from '@/components/database/inputs'
import { AddPropertyDialog, RenamePropertyDialog } from '@/components/database/PropertyDialogs'
import type { Note, PropValue } from '@/notes/types'

/** 標題下方的屬性列。同一層的其他頁面就是同一張表的其他列，從它們推斷型別與選項 */
export function PropertiesEditor({ note }: { note: Note }) {
  const notes = useNotes((s) => s.notes)
  const updateNote = useNotes((s) => s.updateNote)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  // 最上層的頁面彼此不相干，不拿來當建議
  const siblings = useMemo(
    () => (note.parent ? childrenOf(notes, note.parent).filter((n) => n.id !== note.id) : []),
    [notes, note.parent, note.id],
  )
  const siblingFields = useMemo(() => collectFields(siblings), [siblings])

  const entries = Object.entries(note.props)
  const keys = entries.map(([key]) => key)
  const setProps = (props: Note['props']) => updateNote(note.id, { props })
  const setValue = (key: string, value: PropValue) => setProps({ ...note.props, [key]: value })

  const addButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setAdding(true)}
      className="text-muted-foreground"
    >
      <Plus />
      新增屬性
    </Button>
  )

  return (
    <>
      {entries.length === 0 ? (
        <div className="mt-2 -ml-2.5">{addButton}</div>
      ) : (
        <section className="mt-4 grid gap-0.5" aria-label="屬性">
          {entries.map(([key, value]) => (
            <div key={key} className="flex min-w-0 items-center gap-1">
              <span className="w-24 shrink-0 truncate text-sm text-muted-foreground sm:w-32" title={key}>
                {key}
              </span>
              <div className="flex min-w-0 flex-1 items-center">
                <PropValueInput
                  name={key}
                  value={value}
                  field={siblingFields.find((f) => f.key === key)}
                  suggestions={fieldValues(siblings, key)}
                  onChange={(v) => setValue(key, v)}
                />
              </div>
              <Menu>
                <MenuTrigger
                  render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${key} 的更多動作`} />}
                >
                  <MoreHorizontal />
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onClick={() => setRenaming(key)}>
                    <Pencil />
                    重新命名
                  </MenuItem>
                  <MenuItem variant="destructive" onClick={() => setProps(removeProp(note.props, key))}>
                    <Trash2 />
                    刪除屬性
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
          ))}
          <div className="-ml-2.5">{addButton}</div>
        </section>
      )}

      <AddPropertyDialog
        open={adding}
        onOpenChange={setAdding}
        existing={keys}
        suggestions={siblingFields.filter((f) => !keys.includes(f.key))}
        onAdd={(name, type) => setValue(name, defaultValue(type))}
      />
      <RenamePropertyDialog
        name={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        existing={keys}
        onRename={(from, to) => setProps(renameProp(note.props, from, to))}
      />
    </>
  )
}

function PropValueInput({
  name,
  value,
  field,
  suggestions,
  onChange,
}: {
  name: string
  value: PropValue
  /** 同一層其他頁面的同名欄位，自己的值是空字串時用它決定型別 */
  field?: Field
  suggestions: string[]
  onChange: (value: PropValue) => void
}) {
  const type = value === '' && field ? field.type : typeOf(value)
  // 外部改了值（例如表格裡編輯）要重新掛載輸入框，才不會顯示舊的草稿
  const key = `${typeof value}:${String(value)}`

  if (type === 'checkbox') {
    return <CheckboxInput checked={value === true} onChange={onChange} label={name} />
  }
  if (type === 'number') {
    const input = <NumberInput key={key} value={value as number | string} onCommit={onChange} label={name} placeholder="空白" />
    if (!isRating(name, value)) return input
    return (
      <>
        <StarRating value={typeof value === 'number' ? value : 0} onChange={onChange} label={name} />
        <NumberInput key={key} value={value as number | string} onCommit={onChange} label={name} className="w-12 text-center" />
      </>
    )
  }
  return (
    <TextInput
      key={key}
      value={String(value)}
      suggestions={suggestions}
      onCommit={onChange}
      label={name}
      placeholder="空白"
    />
  )
}
