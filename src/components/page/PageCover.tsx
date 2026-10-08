import { useRef, useState } from 'react'
import { Image as ImageIcon, ImagePlus, MoreHorizontal, Move, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { cn } from '@/lib/utils'
import { CoverImage } from '@/components/common/CoverImage'
import { useNotes, releaseAttachments } from '@/store/notes'
import { putAttachment } from '@/storage/db'
import { resizeImage } from '@/lib/resizeImage'
import { COVER_PRESETS, coverAttachment, dragCoverY, presetCover } from '@/notes/covers'
import type { Note } from '@/notes/types'

/**
 * 頁面最上方的封面（像 Notion）。右下角只有一顆「⋯」，點開才是更換、調整位置、移除。
 * 調整位置：上下拖曳圖片，按「儲存位置」才寫回，「取消」恢復原本的位置。
 */
export function PageCover({ note, onPick }: { note: Note; onPick: () => void }) {
  const [repositioning, setRepositioning] = useState(false)
  const [draftY, setDraftY] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startPointer: number } | null>(null)

  if (!note.cover) return null
  const isImage = !!coverAttachment(note.cover)

  const startReposition = () => {
    setDraftY(note.coverY ?? 50)
    setRepositioning(true)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!repositioning) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startY: draftY, startPointer: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const img = box.current?.querySelector('img')
    if (!drag.current || !img || !box.current) return
    const { width, height } = box.current.getBoundingClientRect()
    const dy = e.clientY - drag.current.startPointer
    setDraftY(dragCoverY(drag.current.startY, dy, { width, height }, { width: img.naturalWidth, height: img.naturalHeight }))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const save = () => {
    useNotes.getState().updateNote(note.id, { coverY: Math.round(draftY) })
    setRepositioning(false)
  }

  const overlayButton = 'bg-background/85 backdrop-blur'

  return (
    <div
      ref={box}
      className={cn('group relative select-none', repositioning && 'cursor-grab touch-none active:cursor-grabbing')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <CoverImage cover={note.cover} y={repositioning ? draftY : note.coverY} className="block h-36 w-full sm:h-52" />

      {repositioning ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
            <span className="rounded-full bg-black/55 px-3 py-1.5 text-sm text-white">上下拖曳圖片調整位置</span>
          </div>
          <div className="absolute right-3 bottom-3 flex gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
            <Button size="sm" variant="secondary" className={overlayButton} onClick={() => setRepositioning(false)}>
              取消
            </Button>
            <Button size="sm" onClick={save}>
              儲存位置
            </Button>
          </div>
        </>
      ) : (
        <div className="absolute right-3 bottom-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:has-[[aria-expanded=true]]:opacity-100">
          <Menu>
            <MenuTrigger render={<Button size="icon-sm" variant="secondary" className={overlayButton} aria-label="封面選項" />}>
              <MoreHorizontal />
            </MenuTrigger>
            <MenuContent>
              <MenuItem onClick={onPick}>
                <ImageIcon />
                更換封面
              </MenuItem>
              {isImage && (
                <MenuItem onClick={startReposition}>
                  <Move />
                  調整位置
                </MenuItem>
              )}
              <MenuItem variant="destructive" onClick={() => setCover(note, undefined)}>
                <Trash2 />
                移除封面
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      )}
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
  // 換了一張圖，舊的位置就不適用了
  updateNote(note.id, { cover, coverY: undefined })
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
