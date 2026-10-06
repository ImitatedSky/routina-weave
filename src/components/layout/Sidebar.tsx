import { useMemo, useState } from 'react'
import {
  ChevronRight, Hash, Link2, Network, Plus, Search, Settings, Stamp,
} from 'lucide-react'
import { useNotes, childrenOf } from '@/store/notes'
import { navigate, useRoute, type Route } from '@/store/route'
import { useUi } from '@/store/ui'
import { allTags } from '@/notes/markdown'
import { NoteIcon } from '@/components/common/Thumbnail'
import { cn } from '@/lib/utils'
import type { Note } from '@/notes/types'

export function Sidebar() {
  const notes = useNotes((s) => s.notes)
  const createNote = useNotes((s) => s.createNote)
  const route = useRoute()
  const setSearchOpen = useUi((s) => s.setSearchOpen)
  const openBookmark = useUi((s) => s.openBookmark)
  const setSidebarOpen = useUi((s) => s.setSidebarOpen)

  const pinned = useMemo(() => Object.values(notes).filter((n) => n.pinned && !n.template), [notes])
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of Object.values(notes)) {
      if (note.template) continue
      for (const tag of allTags(note)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [notes])

  const go = (r: Route) => {
    navigate(r)
    setSidebarOpen(false)
  }

  const newPage = () => {
    const note = createNote({ parent: null })
    go({ kind: 'page', id: note.id })
  }

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto bg-sidebar p-2 text-sm" aria-label="側邊欄">
      <div className="flex items-center gap-2 px-2 py-2">
        <span className="text-lg">🧶</span>
        <button className="font-semibold tracking-tight" onClick={() => go({ kind: 'home' })}>
          Weave
        </button>
      </div>

      <NavItem icon={<Search />} label="搜尋" hint="Ctrl K" onClick={() => setSearchOpen(true)} />
      <NavItem icon={<Network />} label="關係圖譜" active={route.kind === 'graph'} onClick={() => go({ kind: 'graph' })} />
      <NavItem icon={<Link2 />} label="網址" active={route.kind === 'bookmarks'} onClick={() => go({ kind: 'bookmarks' })} />
      <NavItem icon={<Stamp />} label="範本" active={route.kind === 'templates'} onClick={() => go({ kind: 'templates' })} />
      <NavItem icon={<Settings />} label="設定" active={route.kind === 'settings'} onClick={() => go({ kind: 'settings' })} />

      {pinned.length > 0 && (
        <Section title="釘選">
          {pinned.map((n) => (
            <PageRow key={n.id} note={n} depth={0} active={route.kind === 'page' && route.id === n.id} onOpen={go} leaf />
          ))}
        </Section>
      )}

      <Section
        title="頁面"
        action={
          <span className="flex gap-0.5">
            <IconAction label="新增網址" onClick={() => { openBookmark(null); setSidebarOpen(false) }}><Link2 /></IconAction>
            <IconAction label="新增頁面" onClick={newPage}><Plus /></IconAction>
          </span>
        }
      >
        <PageTree notes={notes} parent={null} depth={0} route={route} onOpen={go} />
      </Section>

      {tags.length > 0 && (
        <Section title="標籤">
          {tags.map(([tag, count]) => (
            <button
              key={tag}
              onClick={() => go({ kind: 'tag', tag })}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted pointer-coarse:py-2',
                route.kind === 'tag' && route.tag === tag && 'bg-accent text-accent-foreground',
              )}
            >
              <Hash className="size-3.5 text-muted-foreground" />
              <span className="flex-1 truncate">{tag}</span>
              <span className="text-xs text-muted-foreground">{count}</span>
            </button>
          ))}
        </Section>
      )}
    </nav>
  )
}

interface TreeProps {
  notes: Record<string, Note>
  depth: number
  route: Route
  onOpen: (r: Route) => void
}

function PageTree({ parent, ...props }: TreeProps & { parent: string | null }) {
  const children = childrenOf(props.notes, parent).filter((n) => !n.template)
  return (
    <>
      {children.map((n) => (
        <TreeNode key={n.id} {...props} note={n} />
      ))}
    </>
  )
}

function TreeNode({ note, notes, depth, route, onOpen }: TreeProps & { note: Note }) {
  const hasChildren = Object.values(notes).some((c) => c.parent === note.id && !c.template)
  const containsCurrent = route.kind === 'page' && isAncestor(notes, note.id, route.id)
  const [open, setOpen] = useState(containsCurrent)
  // 從連結或搜尋跳到深層頁面時，把它的上層展開，側邊欄才看得到目前位置
  const [prevContains, setPrevContains] = useState(containsCurrent)
  if (containsCurrent !== prevContains) {
    setPrevContains(containsCurrent)
    if (containsCurrent) setOpen(true)
  }
  return (
    <>
      <PageRow
        note={note}
        depth={depth}
        active={route.kind === 'page' && route.id === note.id}
        onOpen={onOpen}
        expandable={hasChildren}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open && hasChildren && <PageTree notes={notes} parent={note.id} depth={depth + 1} route={route} onOpen={onOpen} />}
    </>
  )
}

function isAncestor(notes: Record<string, Note>, ancestor: string, id: string): boolean {
  let current = notes[id]?.parent
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    if (current === ancestor) return true
    seen.add(current)
    current = notes[current]?.parent
  }
  return false
}

function PageRow(props: {
  note: Note
  depth: number
  active: boolean
  onOpen: (r: Route) => void
  expandable?: boolean
  open?: boolean
  onToggle?: () => void
  leaf?: boolean
}) {
  const { note, depth, active, onOpen, expandable, open, onToggle, leaf } = props
  return (
    <div
      className={cn('group flex items-center rounded-md hover:bg-muted', active && 'bg-accent text-accent-foreground hover:bg-accent')}
      style={{ paddingLeft: depth * 14 }}
    >
      {!leaf && (
        <button
          className={cn('flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground pointer-coarse:size-9', !expandable && 'invisible')}
          onClick={onToggle}
          aria-label={open ? '收合' : '展開'}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
      )}
      <button
        className={cn('flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left pointer-coarse:py-2', leaf && 'pl-2')}
        onClick={() => onOpen({ kind: 'page', id: note.id })}
      >
        <NoteIcon note={note} />
        <span className="truncate">{note.title || '未命名'}</span>
      </button>
    </div>
  )
}

function NavItem(props: { icon: React.ReactNode; label: string; hint?: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:py-2.5 [&_svg]:size-4',
        props.active && 'bg-accent text-accent-foreground',
      )}
    >
      {props.icon}
      <span className="flex-1">{props.label}</span>
      {props.hint && <span className="text-xs text-muted-foreground/70 pointer-coarse:hidden">{props.hint}</span>}
    </button>
  )
}

function Section(props: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-3 flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground">{props.title}</span>
        {props.action}
      </div>
      {props.children}
    </div>
  )
}

function IconAction(props: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:size-9 [&_svg]:size-4"
    >
      {props.children}
    </button>
  )
}

