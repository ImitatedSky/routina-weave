import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUi } from '@/store/ui'
import { useNotes } from '@/store/notes'
import { addBookmark, normalizeUrl } from '@/notes/bookmarks'
import { navigate } from '@/store/route'

export function BookmarkDialog() {
  const open = useUi((s) => s.bookmarkOpen)
  const parent = useUi((s) => s.bookmarkParent)
  const close = useUi((s) => s.closeBookmark)
  const parentTitle = useNotes((s) => (parent ? s.notes[parent]?.title : undefined))
  const [text, setText] = useState('')
  const url = normalizeUrl(text)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return
    const note = addBookmark(url, parent)
    setText('')
    close()
    navigate({ kind: 'page', id: note.id })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>新增網址</DialogTitle>
            <DialogDescription>
              {parentTitle ? `會放在「${parentTitle}」底下。` : ''}標題與縮圖會自動抓取。
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            inputMode="url"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="https://"
            aria-invalid={text.trim() !== '' && !url}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>取消</Button>
            <Button type="submit" disabled={!url}>新增</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
