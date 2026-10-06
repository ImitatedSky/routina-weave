import { useState } from 'react'
import {
  BookOpen, FolderInput, Menu as MenuIcon, MoreHorizontal, Pencil, Pin, PinOff, Stamp, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useNotes, pathOf, descendants } from '@/store/notes'
import { navigate, replaceRoute, type Route } from '@/store/route'
import { useUi } from '@/store/ui'
import { MoveDialog } from './MoveDialog'
import { NoteIcon } from '@/components/common/Thumbnail'

const TITLES: Partial<Record<Route['kind'], string>> = {
  home: '首頁',
  graph: '關係圖譜',
  bookmarks: '網址',
  templates: '範本',
  settings: '設定',
}

export function TopBar({ route }: { route: Route }) {
  const setSidebarOpen = useUi((s) => s.setSidebarOpen)
  const mode = useUi((s) => s.mode)
  const setMode = useUi((s) => s.setMode)
  const notes = useNotes((s) => s.notes)
  const note = route.kind === 'page' ? notes[route.id] : undefined

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-1 border-b bg-background/90 px-2 backdrop-blur pointer-coarse:h-14">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="開啟側邊欄">
        <MenuIcon />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm">
        {note ? (
          pathOf(notes, note.id).map((n, i, all) => (
            <span key={n.id} className="flex min-w-0 items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              <button
                onClick={() => navigate({ kind: 'page', id: n.id })}
                className={`flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-muted ${i < all.length - 1 ? 'hidden text-muted-foreground sm:flex' : ''}`}
              >
                <NoteIcon note={n} className="w-4" />
                <span className="truncate">{n.title || '未命名'}</span>
              </button>
            </span>
          ))
        ) : (
          <span className="px-1 font-medium">{route.kind === 'tag' ? `#${route.tag}` : TITLES[route.kind]}</span>
        )}
      </div>

      {note && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
            aria-label={mode === 'edit' ? '切換到預覽' : '切換到編輯'}
          >
            {mode === 'edit' ? <BookOpen /> : <Pencil />}
            <span className="hidden sm:inline">{mode === 'edit' ? '預覽' : '編輯'}</span>
          </Button>
          <PageMenu noteId={note.id} />
        </>
      )}
    </header>
  )
}

function PageMenu({ noteId }: { noteId: string }) {
  const note = useNotes((s) => s.notes[noteId])
  const notes = useNotes((s) => s.notes)
  const updateNote = useNotes((s) => s.updateNote)
  const deleteNote = useNotes((s) => s.deleteNote)
  const [moving, setMoving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  if (!note) return null
  const childCount = descendants(notes, noteId).length

  return (
    <>
      <Menu>
        <MenuTrigger render={<Button variant="ghost" size="icon" aria-label="更多動作" />}>
          <MoreHorizontal />
        </MenuTrigger>
        <MenuContent>
          <MenuItem onClick={() => updateNote(noteId, { pinned: !note.pinned || undefined })}>
            {note.pinned ? <PinOff /> : <Pin />}
            {note.pinned ? '取消釘選' : '釘選'}
          </MenuItem>
          <MenuItem onClick={() => setMoving(true)}>
            <FolderInput />
            移到…
          </MenuItem>
          <MenuItem onClick={() => updateNote(noteId, { template: !note.template || undefined })}>
            <Stamp />
            {note.template ? '取消範本' : '設為範本'}
          </MenuItem>
          <MenuItem variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2 />
            刪除
          </MenuItem>
        </MenuContent>
      </Menu>

      <MoveDialog noteId={noteId} open={moving} onOpenChange={setMoving} />

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除「{note.title}」？</DialogTitle>
            <DialogDescription>
              {childCount > 0 ? `底下的 ${childCount} 個子頁面也會一起刪除。` : ''}刪除後無法復原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const parent = note.parent
                setDeleting(false)
                deleteNote(noteId)
                replaceRoute(parent ? { kind: 'page', id: parent } : { kind: 'home' })
              }}
            >
              刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
