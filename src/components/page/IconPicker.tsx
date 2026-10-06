import { useState } from 'react'
import { SmilePlus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const EMOJI = [
  '📄', '📝', '📓', '📕', '📚', '🔖', '🔗', '📌', '⭐', '💡',
  '🎯', '🧠', '🧶', '🌱', '🌳', '🔥', '⚡', '✅', '📅', '⏰',
  '💼', '💰', '📈', '🏠', '✈️', '🍜', '☕', '🎵', '🎬', '🎮',
  '📷', '🎨', '💻', '🛠️', '🔬', '🧪', '🏃', '💪', '❤️', '😊',
  '🐱', '🐶', '🌙', '☀️', '🌈', '🍀', '🎁', '🗂️', '📦', '🧩',
]

export function IconPicker({ value, onChange }: { value?: string; onChange: (icon: string | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const pick = (icon: string | undefined) => {
    onChange(icon)
    setOpen(false)
  }
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>選擇圖示</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
            {EMOJI.map((e) => (
              <button key={e} onClick={() => pick(e)} className="flex aspect-square items-center justify-center rounded-md text-2xl hover:bg-muted">
                {e}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const icon = [...custom.trim()].slice(0, 2).join('')
              if (icon) pick(icon)
            }}
          >
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="或輸入任何表情符號" />
            <Button type="submit" variant="secondary">使用</Button>
          </form>
          {value && (
            <Button variant="ghost" onClick={() => pick(undefined)}>
              移除圖示
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
