import { useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Button } from '@/components/ui/button'
import { formatDate, hasTime, parseDate, toDateText } from '@/notes/database'
import { cn } from '@/lib/utils'

/**
 * 日期屬性：平常顯示好讀的文字，點了跳出小面板，裡面是原生的日期／時間輸入
 * （手機會叫出系統的選擇器），加上「今天」與「清除」。改了馬上寫回，跟 Notion 一樣。
 * 值是 '' 、YYYY-MM-DD 或 YYYY-MM-DD HH:mm。
 */
export function DateInput({
  value,
  onCommit,
  label,
  placeholder = '空白',
  className,
}: {
  value: string
  onCommit: (value: string) => void
  label: string
  /** 表格裡空的儲存格不顯示字，跟其他欄一致 */
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const parsed = parseDate(value)
  const day = parsed ? toDateText(parsed) : ''
  const time = parsed && hasTime(value) ? toDateText(parsed, true).slice(11) : ''
  // 不是日期格式的舊值（例如手打的文字）原樣顯示，選了日期就會蓋掉
  const text = formatDate(value) ?? value

  const setDay = (next: string) => onCommit(time ? `${next} ${time}` : next)

  const inputClass =
    'h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus:border-ring pointer-coarse:h-10'

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`${label}：${text || '空白'}`}
        className={cn(
          'flex h-8 w-full min-w-0 items-center rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted data-popup-open:bg-muted pointer-coarse:h-10',
          className,
        )}
      >
        {text ? <span className="truncate">{text}</span> : <span className="text-muted-foreground/60">{placeholder}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="start" className="z-50">
          <Popover.Popup className="grid w-64 gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md outline-none">
            <input
              type="date"
              value={day}
              // 桌機上逐格打字時中途會送出空字串，忽略它；要清空請按「清除」
              onChange={(e) => {
                if (e.target.value) setDay(e.target.value)
              }}
              aria-label={`${label}的日期`}
              className={inputClass}
            />
            <div className="flex items-center gap-2">
              <label className={cn('flex h-8 shrink-0 cursor-pointer items-center gap-2 text-sm pointer-coarse:h-10', !day && 'opacity-50')}>
                <input
                  type="checkbox"
                  checked={time !== ''}
                  disabled={!day}
                  onChange={(e) => onCommit(e.target.checked ? toDateText(withNowTime(parsed!), true) : day)}
                  className="size-4 accent-primary"
                />
                加時間
              </label>
              {time && (
                <input
                  type="time"
                  value={time}
                  onChange={(e) => {
                    if (e.target.value) onCommit(`${day} ${e.target.value}`)
                  }}
                  aria-label={`${label}的時間`}
                  className={inputClass}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setDay(toDateText(new Date()))}>
                今天
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                disabled={!value}
                onClick={() => {
                  onCommit('')
                  setOpen(false)
                }}
              >
                清除
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** 打開「加時間」時先填現在的時間，日期不變 */
function withNowTime(day: Date): Date {
  const now = new Date()
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), now.getHours(), now.getMinutes())
}
