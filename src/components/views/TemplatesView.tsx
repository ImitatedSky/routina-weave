import { useMemo, useState, type FormEvent } from 'react'
import { FilePlus2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { NoteIcon } from '@/components/common/Thumbnail'
import { useNotes } from '@/store/notes'
import { navigate } from '@/store/route'
import type { Note } from '@/notes/types'

/** 內文前兩行有字的部分，去掉 Markdown 標題符號，當預覽 */
function previewLines(body: string): string {
  return body
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n')
}

export function TemplatesView() {
  const notes = useNotes((s) => s.notes)
  const createNote = useNotes((s) => s.createNote)
  const [using, setUsing] = useState<Note | null>(null)

  const templates = useMemo(
    () => Object.values(notes).filter((n) => n.template).sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant')),
    [notes],
  )
  // 每個範本被幾個頁面設成「子頁面預設範本」
  const usage = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of Object.values(notes)) {
      if (n.childTemplate) counts[n.childTemplate] = (counts[n.childTemplate] ?? 0) + 1
    }
    return counts
  }, [notes])

  const addTemplate = () => {
    const note = createNote({ template: true, parent: null, title: '新範本' })
    navigate({ kind: 'page', id: note.id })
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-24 sm:px-8">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-bold tracking-tight">範本</h1>
        <Button onClick={addTemplate}>
          <Plus />
          新增範本
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        範本的內文與屬性可以用 <code>{'{{title}}'}</code>、<code>{'{{date}}'}</code>、<code>{'{{time}}'}</code>，建立頁面時會換成標題、今天日期與現在時間。
      </p>

      {templates.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          還沒有範本。按右上角新增，或在任何頁面的 ⋯ 選單選「設為範本」。
        </p>
      ) : (
        <div className="mt-6 grid gap-3">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} usage={usage[t.id] ?? 0} onUse={() => setUsing(t)} />
          ))}
        </div>
      )}

      <UseTemplateDialog
        template={using}
        onClose={() => setUsing(null)}
        onCreate={(template, title) => {
          const note = createNote({ parent: null, templateId: template.id, title })
          setUsing(null)
          navigate({ kind: 'page', id: note.id })
        }}
      />
    </div>
  )
}

function TemplateCard({ template, usage, onUse }: { template: Note; usage: number; onUse: () => void }) {
  const preview = previewLines(template.body)
  const props = Object.keys(template.props)
  return (
    <div className="rounded-xl border bg-card p-3">
      <button onClick={() => navigate({ kind: 'page', id: template.id })} className="flex w-full items-start gap-3 text-left">
        <NoteIcon note={template} className="mt-0.5 w-6 text-xl" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{template.title || '未命名'}</span>
          {preview && <span className="mt-0.5 line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">{preview}</span>}
          {(props.length > 0 || usage > 0) && (
            <span className="mt-1.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
              {props.length > 0 && <span className="rounded-md bg-muted px-1.5 py-0.5">屬性：{props.join('、')}</span>}
              {usage > 0 && <span className="rounded-md bg-muted px-1.5 py-0.5">{usage} 個頁面的子頁面預設範本</span>}
            </span>
          )}
        </span>
      </button>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ kind: 'page', id: template.id })}>
          <Pencil />
          編輯
        </Button>
        <Button variant="outline" size="sm" onClick={onUse}>
          <FilePlus2 />
          用這個範本建立
        </Button>
      </div>
    </div>
  )
}

function UseTemplateDialog({
  template,
  onClose,
  onCreate,
}: {
  template: Note | null
  onClose: () => void
  onCreate: (template: Note, title: string) => void
}) {
  return (
    <Dialog open={template !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        {template && <UseTemplateForm template={template} onCancel={onClose} onCreate={(title) => onCreate(template, title)} />}
      </DialogContent>
    </Dialog>
  )
}

function UseTemplateForm({
  template,
  onCancel,
  onCreate,
}: {
  template: Note
  onCancel: () => void
  onCreate: (title: string) => void
}) {
  const [title, setTitle] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onCreate(title.trim() || '未命名')
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>用「{template.title}」建立頁面</DialogTitle>
        <DialogDescription>新頁面會放在最上層，之後可以從 ⋯ 選單搬到別的頁面底下。</DialogDescription>
      </DialogHeader>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="未命名"
        aria-label="新頁面標題"
        autoFocus
        className="pointer-coarse:h-10"
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button type="submit">建立</Button>
      </DialogFooter>
    </form>
  )
}
