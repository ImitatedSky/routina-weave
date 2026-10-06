import { useRef, useState, type KeyboardEvent } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { Star } from 'lucide-react'
import { parseInput } from '@/notes/database'
import type { PropValue } from '@/notes/types'
import { cn } from '@/lib/utils'

/**
 * 屬性值的輸入框。跟標題一樣在 Enter 或離開欄位時才寫回，
 * 打字途中不會每個字都存一次。外部的值變了請用 key 重新掛載。
 */

const fieldClass =
  'h-8 w-full min-w-0 rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60 hover:bg-muted focus:bg-muted pointer-coarse:h-10'

interface CommonProps {
  onDone?: () => void
  autoFocus?: boolean
  className?: string
  label: string
  placeholder?: string
}

/** 送出與取消的共用邏輯 */
/** onCommit 回傳 false 表示不接受，還原成上次的值 */
function useDraft(initial: string, onCommit: (text: string) => boolean | void, onDone?: () => void) {
  const [draft, setDraft] = useState(initial)
  // 用 ref 記：Enter 觸發的 blur 會在 React 重新 render 前就跑，state 還是舊的
  const draftRef = useRef(initial)
  const committedRef = useRef(initial)
  const cancelRef = useRef(false)

  const change = (text: string) => {
    draftRef.current = text
    setDraft(text)
  }
  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false
      change(committedRef.current)
    } else if (draftRef.current !== committedRef.current) {
      if (onCommit(draftRef.current) === false) change(committedRef.current)
      else committedRef.current = draftRef.current
    }
    onDone?.()
  }
  const cancel = () => {
    cancelRef.current = true
  }
  return { draft, change, commit, cancel }
}

export function TextInput({
  value,
  suggestions = [],
  onCommit,
  ...common
}: CommonProps & { value: string; suggestions?: string[]; onCommit: (value: string) => void }) {
  const { draft, change, commit, cancel } = useDraft(value, onCommit, common.onDone)
  const [typed, setTyped] = useState(false)
  const highlighted = useRef<string | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 有選項被選中時 Enter 交給 Autocomplete 選它
    if (e.key === 'Enter' && highlighted.current === undefined) {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      cancel()
      e.currentTarget.blur()
    }
  }

  const inputProps = {
    autoFocus: common.autoFocus,
    placeholder: common.placeholder,
    'aria-label': common.label,
    onBlur: commit,
    onKeyDown,
    className: cn(fieldClass, common.className),
  }

  if (!suggestions.length) {
    return <input ref={inputRef} value={draft} onChange={(e) => change(e.target.value)} {...inputProps} />
  }

  // 還沒打字時列出全部選項，像 Notion 的 select；打了字才過濾
  const query = draft.trim().toLowerCase()
  const items = typed && query ? suggestions.filter((s) => s.toLowerCase().includes(query)) : suggestions

  return (
    <Autocomplete.Root
      items={items}
      mode="none"
      openOnInputClick
      defaultOpen={common.autoFocus}
      value={draft}
      onValueChange={(text, details) => {
        change(text)
        if (details.reason === 'item-press') {
          inputRef.current?.blur()
        } else {
          setTyped(true)
        }
      }}
      onItemHighlighted={(item) => {
        highlighted.current = item
      }}
      onOpenChange={(open) => {
        if (!open) highlighted.current = undefined
      }}
    >
      <Autocomplete.Input ref={inputRef} {...inputProps} />
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={4} align="start" className="z-50">
          <Autocomplete.Popup className="max-h-64 min-w-[max(var(--anchor-width),10rem)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md data-empty:hidden">
            <Autocomplete.List>
              {(item: string) => (
                <Autocomplete.Item
                  key={item}
                  value={item}
                  className="flex cursor-default items-center rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted pointer-coarse:py-2.5"
                >
                  {item}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  )
}

export function NumberInput({
  value,
  onCommit,
  ...common
}: CommonProps & { value: number | string; onCommit: (value: PropValue) => void }) {
  const { draft, change, commit, cancel } = useDraft(String(value), (text) => {
    const parsed = parseInput(text, 'number')
    // 打了不是數字的東西就還原
    if (parsed === null) return false
    onCommit(parsed)
  }, common.onDone)

  return (
    <input
      value={draft}
      onChange={(e) => change(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          cancel()
          e.currentTarget.blur()
        }
      }}
      inputMode="decimal"
      autoFocus={common.autoFocus}
      placeholder={common.placeholder}
      aria-label={common.label}
      className={cn(fieldClass, 'tabular-nums', common.className)}
    />
  )
}

/** 外層 label 撐到 40px，手指好點；勾選框本身維持一般大小 */
export function CheckboxInput({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  className?: string
}) {
  return (
    <label className={cn('flex h-8 w-fit cursor-pointer items-center rounded-md px-2 hover:bg-muted pointer-coarse:h-10 pointer-coarse:px-3', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="size-4 accent-primary"
      />
    </label>
  )
}

/** 點同一顆星可以歸零 */
export function StarRating({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="flex shrink-0 items-center" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? 0 : n)}
          aria-label={`${n} 顆星`}
          aria-pressed={n <= value}
          className="flex h-8 w-7 items-center justify-center rounded-md hover:bg-muted pointer-coarse:h-10 pointer-coarse:w-8"
        >
          <Star className={cn('size-4', n <= value ? 'fill-current text-foreground' : 'text-muted-foreground/50')} />
        </button>
      ))}
    </div>
  )
}
