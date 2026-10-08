import { useEffect, useMemo, useRef, useState } from 'react'
import { Shuffle, SmilePlus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { loadEmojiGroups, recentEmoji, rememberEmoji, searchEmoji, type EmojiGroup, type EmojiItem } from './emojiData'

/**
 * 頁面圖示：完整的 emoji 圖示庫（像 Notion）——分類、中文搜尋、最近用過、隨機。
 * 資料在第一次打開時才載入。
 */
export function IconPicker({ value, onChange }: { value?: string; onChange: (icon: string | undefined) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex size-12 items-center justify-center rounded-lg text-4xl hover:bg-muted"
        aria-label="更換圖示"
      >
        {value ?? <SmilePlus className="size-6 text-muted-foreground/60" />}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>選擇圖示</DialogTitle>
          </DialogHeader>
          {open && (
            <EmojiPicker
              hasValue={!!value}
              onPick={(emoji) => {
                rememberEmoji(emoji)
                onChange(emoji)
                setOpen(false)
              }}
              onRemove={() => {
                onChange(undefined)
                setOpen(false)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function EmojiPicker(props: { hasValue: boolean; onPick: (emoji: string) => void; onRemove: () => void }) {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null)
  const [query, setQuery] = useState('')
  const recent = useMemo(() => recentEmoji(), [])
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void loadEmojiGroups().then((g) => {
      if (!cancelled) setGroups(g)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const results = useMemo(() => (groups ? searchEmoji(groups, query) : []), [groups, query])

  const random = () => {
    if (!groups) return
    const all = groups.flatMap((g) => g.items)
    props.onPick(all[Math.floor(Math.random() * all.length)].emoji)
  }

  const jumpTo = (id: number) => {
    const section = scroller.current?.querySelector<HTMLElement>(`[data-group="${id}"]`)
    if (section && scroller.current) scroller.current.scrollTop = section.offsetTop - scroller.current.offsetTop
  }

  return (
    <>
      <div className="flex shrink-0 gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋，例如：書、貓、火" aria-label="搜尋圖示" />
        <Button variant="outline" size="icon" onClick={random} disabled={!groups} aria-label="隨機" title="隨機">
          <Shuffle />
        </Button>
        {props.hasValue && (
          <Button variant="outline" size="icon" onClick={props.onRemove} aria-label="移除圖示" title="移除圖示">
            <Trash2 />
          </Button>
        )}
      </div>

      {groups && !query && (
        <div className="flex shrink-0 gap-1 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => jumpTo(g.id)}
              title={g.label}
              aria-label={g.label}
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-xl hover:bg-muted"
            >
              {g.items[0].emoji}
            </button>
          ))}
        </div>
      )}

      <div ref={scroller} className="-mx-1 min-h-48 flex-1 overflow-y-auto px-1">
        {!groups ? (
          <p className="py-10 text-center text-sm text-muted-foreground">載入中…</p>
        ) : query ? (
          results.length ? (
            <EmojiGrid items={results} onPick={props.onPick} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">找不到「{query}」</p>
          )
        ) : (
          <>
            {recent.length > 0 && (
              <Section label="最近用過">
                <EmojiGrid items={recent.map((emoji) => ({ emoji, label: emoji }))} onPick={props.onPick} />
              </Section>
            )}
            {groups.map((g) => (
              <Section key={g.id} label={g.label} groupId={g.id}>
                <EmojiGrid items={g.items} onPick={props.onPick} />
              </Section>
            ))}
          </>
        )}
      </div>
    </>
  )
}

function Section({ label, groupId, children }: { label: string; groupId?: number; children: React.ReactNode }) {
  return (
    // content-visibility：一千多個按鈕，捲到才畫，手機上打開不會卡
    <section data-group={groupId} className="mb-3 [contain-intrinsic-size:auto_400px] [content-visibility:auto]">
      <h3 className="sticky top-0 z-10 bg-popover py-1 text-xs font-medium text-muted-foreground">{label}</h3>
      {children}
    </section>
  )
}

function EmojiGrid({ items, onPick }: { items: Pick<EmojiItem, 'emoji' | 'label'>[]; onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 sm:grid-cols-9">
      {items.map((item) => (
        <button
          key={item.emoji}
          onClick={() => onPick(item.emoji)}
          title={item.label}
          aria-label={item.label}
          className={cn('flex aspect-square items-center justify-center rounded-md text-2xl hover:bg-muted')}
        >
          {item.emoji}
        </button>
      ))}
    </div>
  )
}
