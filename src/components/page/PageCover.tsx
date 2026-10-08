import { useRef, useState } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CoverImage } from '@/components/common/CoverImage'
import { useNotes, releaseAttachments } from '@/store/notes'
import { putAttachment } from '@/storage/db'
import { resizeImage } from '@/lib/resizeImage'
import { COVER_PRESETS, coverAttachment, presetCover } from '@/notes/covers'
import type { Note } from '@/notes/types'

/** 頁面最上方的封面（像 Notion）。有封面時右下角有「更換」「移除」 */
export function PageCover({ note, onPick }: { note: Note; onPick: () => void }) {
  if (!note.cover) return null
  return (
    <div className="group relative">
      <CoverImage cover={note.cover} className="block h-36 w-full sm:h-52" />
      <div className="absolute right-3 bottom-3 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <Button size="sm" variant="secondary" className="bg-background/85 backdrop-blur" onClick={onPick}>
          更換封面
        </Button>
        <Button size="sm" variant="secondary" className="bg-background/85 backdrop-blur" onClick={() => setCover(note, undefined)} aria-label="移除封面">
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

/** 圖示旁邊的「新增封面」按鈕（還沒有封面時才出現） */
export function AddCoverButton({ onPick }: { onPick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onPick}>
      <ImagePlus />
      新增封面
    </Button>
  )
}

function setCover(note: Note, cover: string | undefined) {
  const { updateNote } = useNotes.getState()
  const old = coverAttachment(note.cover)
  updateNote(note.id, { cover })
  // 舊的封面圖片沒有別的頁面在用就刪掉
  if (old && old !== cover) releaseAttachments(useNotes.getState().notes, [old])
}

export function CoverPicker({ note, open, onOpenChange }: { note: Note; open: boolean; onOpenChange: (open: boolean) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const gradients = COVER_PRESETS.filter((p) => p.css.includes('gradient'))
  const colors = COVER_PRESETS.filter((p) => !p.css.includes('gradient'))

  const pick = (cover: string) => {
    setCover(note, cover)
    onOpenChange(false)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const blob = await resizeImage(file)
      const id = crypto.randomUUID()
      await putAttachment({ id, blob, type: blob.type })
      pick(id)
    } catch {
      toast.error('這張圖片讀不進來，換一張試試')
    } finally {
      setBusy(false)
    }
  }

  const swatch = 'h-14 rounded-lg ring-offset-2 ring-offset-popover hover:ring-2 hover:ring-ring'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>選擇封面</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload />
            {busy ? '處理中…' : '用自己的圖片'}
          </Button>
          {note.image && (
            <Button variant="outline" onClick={() => pick(note.image!)}>
              用網頁縮圖
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void upload(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        <section>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">漸層</h3>
          <div className="grid grid-cols-4 gap-2">
            {gradients.map((p) => (
              <button key={p.id} aria-label={p.label} title={p.label} className={swatch} style={{ background: p.css }} onClick={() => pick(presetCover(p.id))} />
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">純色</h3>
          <div className="grid grid-cols-4 gap-2">
            {colors.map((p) => (
              <button key={p.id} aria-label={p.label} title={p.label} className={swatch} style={{ background: p.css }} onClick={() => pick(presetCover(p.id))} />
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
