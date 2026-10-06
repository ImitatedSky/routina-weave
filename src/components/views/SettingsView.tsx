import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useUi, type Theme } from '@/store/ui'
import { useNotes } from '@/store/notes'
import { allAttachments, putAttachment } from '@/storage/db'
import { cn } from '@/lib/utils'
import { saveFile } from '@/lib/saveFile'
import { buildExportZip, exportFilename, prepareImport, type PreparedImport } from '@/lib/zip'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '跟隨系統' },
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
]

export function SettingsView() {
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-24 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">設定</h1>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">外觀</h2>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={cn('rounded-lg border px-3 py-2 text-sm', theme === t.value && 'border-primary bg-accent text-accent-foreground')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <DataSection />
    </div>
  )
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function DataSection() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PreparedImport | null>(null)

  const exportAll = async () => {
    setBusy(true)
    try {
      const notes = Object.values(useNotes.getState().notes)
      const data = await buildExportZip(notes, await allAttachments())
      // fflate 產生的是一般的 ArrayBuffer，型別寫成 ArrayBufferLike 而已
      const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
      if ((await saveFile(blob, exportFilename())) === 'saved') toast.success(`已匯出 ${notes.length} 則筆記`)
    } catch (error) {
      toast.error(`匯出失敗：${errorText(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const sources = await Promise.all(
        [...files].map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
      )
      const prepared = prepareImport(sources, useNotes.getState().notes)
      const { added, updated, skipped } = prepared.plan
      if (added + updated === 0 && prepared.attachments.length === 0) {
        toast.info(prepared.failed.length ? `沒有可匯入的筆記，${prepared.failed.length} 個檔案無法讀取` : `沒有新的筆記（略過 ${skipped} 則）`)
      } else {
        setPending(prepared)
      }
    } catch (error) {
      toast.error(`匯入失敗：${errorText(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const confirmImport = async () => {
    if (!pending) return
    setPending(null)
    try {
      // 附件先寫，筆記出現時縮圖就讀得到
      for (const attachment of pending.attachments) await putAttachment(attachment)
      useNotes.getState().importNotes(pending.plan.notes)
      const { added, updated } = pending.plan
      toast.success(`已匯入：新增 ${added} 則、更新 ${updated} 則`)
    } catch (error) {
      toast.error(`匯入失敗：${errorText(error)}`)
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">資料</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        匯出成 zip，每則筆記是一個 Markdown 檔，子頁面放在同名資料夾裡。匯入可以選 zip 或 .md 檔，Obsidian、Notion 匯出的也可以。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={exportAll}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
        >
          <Download className="size-4" />
          匯出 zip
        </button>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
        >
          <Upload className="size-4" />
          匯入
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.md"
        multiple
        hidden
        onChange={(e) => {
          void pickFiles(e.target.files)
          // 清掉，同一個檔案再選一次才會觸發 change
          e.target.value = ''
        }}
      />

      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>匯入筆記</DialogTitle>
            <DialogDescription>同一則筆記已經存在時，以最後修改時間較新的為準。</DialogDescription>
          </DialogHeader>
          {pending && (
            <ul className="space-y-1 text-sm">
              <li>新增 {pending.plan.added} 則</li>
              <li>更新 {pending.plan.updated} 則</li>
              <li>略過 {pending.plan.skipped} 則（已經是最新）</li>
              {pending.attachments.length > 0 && <li>附件 {pending.attachments.length} 個</li>}
              {pending.failed.length > 0 && (
                <li className="text-destructive">{pending.failed.length} 個檔案無法讀取，會略過</li>
              )}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              取消
            </Button>
            <Button onClick={confirmImport}>匯入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
