import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FIELD_TYPE_LABELS, type Field, type FieldType } from '@/notes/database'
import { cn } from '@/lib/utils'

const TYPES = Object.keys(FIELD_TYPE_LABELS) as FieldType[]

/** 新增屬性：名稱＋型別。suggestions 是同一層其他頁面用過、這頁還沒有的欄位 */
export function AddPropertyDialog({
  open,
  onOpenChange,
  existing,
  suggestions = [],
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing: string[]
  suggestions?: Field[]
  onAdd: (name: string, type: FieldType) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* 表單放在 DialogContent 裡，關掉再打開時欄位會重置 */}
        <AddPropertyForm
          existing={existing}
          suggestions={suggestions}
          onCancel={() => onOpenChange(false)}
          onAdd={(name, type) => {
            onAdd(name, type)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function AddPropertyForm({
  existing,
  suggestions,
  onCancel,
  onAdd,
}: {
  existing: string[]
  suggestions: Field[]
  onCancel: () => void
  onAdd: (name: string, type: FieldType) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<FieldType>('text')
  const trimmed = name.trim()
  const duplicate = existing.includes(trimmed)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (trimmed && !duplicate) onAdd(trimmed, type)
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>新增屬性</DialogTitle>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="屬性名稱，例如：狀態"
          aria-label="屬性名稱"
          autoFocus
          className="pointer-coarse:h-10"
        />
        {duplicate && <p className="text-xs text-destructive">已經有「{trimmed}」了</p>}
      </div>

      {suggestions.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">同一層的其他頁面用過</span>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setName(f.key)
                  setType(f.type)
                }}
                className="h-8 rounded-md border px-2.5 text-sm hover:bg-muted pointer-coarse:h-10"
              >
                {f.key}
                <span className="ml-1 text-xs text-muted-foreground">{FIELD_TYPE_LABELS[f.type]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <span className="text-xs text-muted-foreground">型別</span>
        <div className="flex rounded-lg border p-0.5" role="radiogroup" aria-label="型別">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                'h-8 flex-1 rounded-md text-sm text-muted-foreground pointer-coarse:h-10',
                type === t && 'bg-muted font-medium text-foreground',
              )}
            >
              {FIELD_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button type="submit" disabled={!trimmed || duplicate}>新增</Button>
      </DialogFooter>
    </form>
  )
}

export function RenamePropertyDialog({
  name,
  onOpenChange,
  existing,
  onRename,
}: {
  /** 要改名的欄位；null 是關閉 */
  name: string | null
  onOpenChange: (open: boolean) => void
  existing: string[]
  onRename: (from: string, to: string) => void
}) {
  return (
    <Dialog open={name !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {name !== null && (
          <RenameForm
            name={name}
            existing={existing}
            onCancel={() => onOpenChange(false)}
            onRename={(to) => {
              onRename(name, to)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({
  name,
  existing,
  onCancel,
  onRename,
}: {
  name: string
  existing: string[]
  onCancel: () => void
  onRename: (to: string) => void
}) {
  const [value, setValue] = useState(name)
  const trimmed = value.trim()
  const duplicate = trimmed !== name && existing.includes(trimmed)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed && !duplicate) onRename(trimmed)
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>重新命名屬性</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="屬性名稱"
          autoFocus
          className="pointer-coarse:h-10"
        />
        {duplicate && <p className="text-xs text-destructive">已經有「{trimmed}」了</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button type="submit" disabled={!trimmed || duplicate}>儲存</Button>
      </DialogFooter>
    </form>
  )
}
