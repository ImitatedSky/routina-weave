import { useMemo, useState, type ReactNode } from 'react'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { Check, ChevronDown, LayoutGrid, Link, List, Plus, Stamp, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NoteIcon } from '@/components/common/Thumbnail'
import { ListView } from '@/components/database/ListView'
import { TableView } from '@/components/database/TableView'
import { GalleryView } from '@/components/database/GalleryView'
import { useNotes, childrenOf } from '@/store/notes'
import { useUi } from '@/store/ui'
import { navigate } from '@/store/route'
import { collectFields } from '@/notes/database'
import type { ChildView, Note } from '@/notes/types'
import { cn } from '@/lib/utils'

const VIEWS: { view: ChildView; label: string; Icon: typeof List }[] = [
  { view: 'list', label: '清單', Icon: List },
  { view: 'table', label: '表格', Icon: Table2 },
  { view: 'gallery', label: '卡片', Icon: LayoutGrid },
]

/** 內文下方的子頁面。子頁面的屬性就是資料庫的欄位，可以切成清單、表格、卡片 */
export function ChildPages({ note }: { note: Note }) {
  const notes = useNotes((s) => s.notes)
  const createNote = useNotes((s) => s.createNote)
  const updateNote = useNotes((s) => s.updateNote)
  const [choosingDefault, setChoosingDefault] = useState(false)

  // childrenOf 回傳共用陣列，複製一份再交給會排序、篩選的地方
  const children = useMemo(() => [...childrenOf(notes, note.id)], [notes, note.id])
  const fields = useMemo(() => collectFields(children), [children])
  const templates = useMemo(
    () => Object.values(notes).filter((n) => n.template).sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant')),
    [notes],
  )
  const view = note.view ?? 'list'

  // 沒給 templateId 時 createNote 會自己套用這頁的預設範本
  const add = (templateId?: string) => {
    const child = createNote(templateId ? { parent: note.id, templateId } : { parent: note.id })
    navigate({ kind: 'page', id: child.id })
  }

  const addMenu = (
    <AddMenu
      note={note}
      templates={templates}
      onAddWithTemplate={add}
      onChooseDefault={() => setChoosingDefault(true)}
      attached={children.length > 0}
    />
  )
  const dialog = (
    <DefaultTemplateDialog
      open={choosingDefault}
      onOpenChange={setChoosingDefault}
      templates={templates}
      current={note.childTemplate}
      onChoose={(id) => {
        updateNote(note.id, { childTemplate: id })
        setChoosingDefault(false)
      }}
    />
  )

  // 沒有子頁面時只留一行，不佔版面
  if (!children.length) {
    return (
      <section className="mt-8 -ml-2.5 flex items-center">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => add()}>
          <Plus />
          新增子頁面
        </Button>
        {addMenu}
        {dialog}
      </section>
    )
  }

  return (
    <section className="mt-10">
      <div className="mb-2 flex items-center gap-1.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">子頁面（{children.length}）</h2>
        <div className="flex rounded-lg border p-0.5" role="radiogroup" aria-label="顯示方式">
          {VIEWS.map(({ view: v, label, Icon }) => (
            <button
              key={v}
              role="radio"
              aria-checked={view === v}
              aria-label={label}
              title={label}
              onClick={() => updateNote(note.id, { view: v })}
              className={cn('rounded-md p-1.5 text-muted-foreground pointer-coarse:p-2.5', view === v && 'bg-muted text-foreground')}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        <div className="flex">
          <Button variant="outline" size="sm" className="rounded-r-none" onClick={() => add()}>
            <Plus />
            新增
          </Button>
          {addMenu}
        </div>
      </div>

      {view === 'table' && <TableView parent={note} items={children} />}
      {view === 'gallery' && <GalleryView items={children} fields={fields} />}
      {view === 'list' && <ListView items={children} fields={fields} />}
      {dialog}
    </section>
  )
}

function AddMenu({
  note,
  templates,
  onAddWithTemplate,
  onChooseDefault,
  attached,
}: {
  note: Note
  templates: Note[]
  onAddWithTemplate: (templateId: string) => void
  onChooseDefault: () => void
  /** 接在「新增」按鈕右邊，組成一個分割按鈕 */
  attached: boolean
}) {
  const openBookmark = useUi((s) => s.openBookmark)
  const current = templates.find((t) => t.id === note.childTemplate)

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant={attached ? 'outline' : 'ghost'}
            size="icon-sm"
            className={attached ? 'rounded-l-none border-l-0' : 'text-muted-foreground'}
            aria-label="更多新增方式"
          />
        }
      >
        <ChevronDown />
      </MenuTrigger>
      <MenuContent className="max-h-[min(24rem,var(--available-height))] overflow-y-auto">
        <MenuItem onClick={() => openBookmark(note.id)}>
          <Link />
          新增網址
        </MenuItem>
        {templates.length > 0 && <MenuPrimitive.Separator className="my-1 h-px bg-border" />}
        {templates.length > 0 && (
          <MenuPrimitive.Group>
            <MenuPrimitive.GroupLabel className="px-2 py-1 text-xs text-muted-foreground">用範本新增</MenuPrimitive.GroupLabel>
            {templates.map((t) => (
              <MenuItem key={t.id} onClick={() => onAddWithTemplate(t.id)}>
                <NoteIcon note={t} className="w-4" />
                <span className="truncate">{t.title || '未命名'}</span>
              </MenuItem>
            ))}
          </MenuPrimitive.Group>
        )}
        <MenuPrimitive.Separator className="my-1 h-px bg-border" />
        <MenuItem onClick={onChooseDefault}>
          <Stamp />
          <span className="min-w-0">
            <span className="block">設定預設範本</span>
            <span className="block truncate text-xs text-muted-foreground">{current ? current.title : '未設定'}</span>
          </span>
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function DefaultTemplateDialog({
  open,
  onOpenChange,
  templates,
  current,
  onChoose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: Note[]
  current: string | undefined
  onChoose: (id: string | undefined) => void
}) {
  const option = (id: string | undefined, label: ReactNode) => (
    <button
      key={id ?? 'none'}
      role="radio"
      aria-checked={current === id}
      onClick={() => onChoose(id)}
      className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {current === id && <Check className="size-4 shrink-0" />}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>子頁面預設範本</DialogTitle>
          <DialogDescription>在這一頁底下按「新增」時，會自動套用這個範本。</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 grid max-h-80 gap-0.5 overflow-y-auto" role="radiogroup" aria-label="預設範本">
          {option(undefined, <span className="text-muted-foreground">不使用範本</span>)}
          {templates.map((t) =>
            option(
              t.id,
              <span className="flex items-center gap-2">
                <NoteIcon note={t} />
                <span className="truncate">{t.title || '未命名'}</span>
              </span>,
            ),
          )}
        </div>
        {templates.length === 0 && (
          <p className="text-xs text-muted-foreground">還沒有範本。在任何頁面的 ⋯ 選單選「設為範本」，或到左側「範本」新增。</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
