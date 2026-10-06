import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { Bold, Heading, Italic, KeyboardOff, List, ListTodo, Redo2, Slash, Undo2 } from 'lucide-react'
import { startCompletion } from '@codemirror/autocomplete'
import { redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { toggleBlock, toggleWrap } from './format'

/** 在游標處插入文字並打開自動完成（[[ 標題清單、/ 選單） */
function insertAndComplete(view: EditorView, text: string) {
  const { from } = view.state.selection.main
  // / 選單只認行首或空白後的 /
  const needSpace = text === '/' && from > 0 && !/\s/.test(view.state.sliceDoc(from - 1, from))
  view.dispatch(view.state.replaceSelection(needSpace ? ' ' + text : text))
  startCompletion(view)
}

const ACTIONS: { label: string; icon: ReactNode; run: (view: EditorView) => void }[] = [
  { label: '粗體', icon: <Bold />, run: (view) => toggleWrap('**')(view) },
  { label: '斜體', icon: <Italic />, run: (view) => toggleWrap('*')(view) },
  { label: '切換標題', icon: <Heading />, run: (view) => toggleBlock('heading')(view) },
  { label: '清單', icon: <List />, run: (view) => toggleBlock('bullet')(view) },
  { label: '待辦', icon: <ListTodo />, run: (view) => toggleBlock('task')(view) },
  { label: '連結到頁面', icon: <span className="text-sm font-semibold">[[</span>, run: (view) => insertAndComplete(view, '[[') },
  { label: '插入選單', icon: <Slash />, run: (view) => insertAndComplete(view, '/') },
  { label: '復原', icon: <Undo2 />, run: (view) => undo(view) },
  { label: '重做', icon: <Redo2 />, run: (view) => redo(view) },
]

/** 鍵盤彈出時把工具列墊在鍵盤上面。Android 殼會縮小視窗，這時差值是 0；手機瀏覽器只縮 visualViewport */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

/**
 * 手機（pointer: coarse）編輯時黏在畫面底部的格式按鈕，桌機用 CSS 藏起來。
 * 按鈕在 mousedown 時 preventDefault，編輯器才不會失焦、鍵盤不會收起來。
 */
export function MobileToolbar({ viewRef }: { viewRef: RefObject<EditorView | null> }) {
  const inset = useKeyboardInset()

  const run = (action: (view: EditorView) => void) => {
    const view = viewRef.current
    if (!view) return
    action(view)
    view.focus()
  }

  return (
    <div
      role="toolbar"
      aria-label="格式工具列"
      style={{ bottom: inset }}
      className="fixed inset-x-0 z-20 hidden gap-0.5 overflow-x-auto border-t bg-background/95 px-1 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur pointer-coarse:flex"
    >
      {ACTIONS.map((action) => (
        <ToolbarButton key={action.label} label={action.label} onPress={() => run(action.run)}>
          {action.icon}
        </ToolbarButton>
      ))}
      <ToolbarButton label="收起鍵盤" onPress={() => viewRef.current?.contentDOM.blur()}>
        <KeyboardOff />
      </ToolbarButton>
    </div>
  )
}

function ToolbarButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className="flex h-10 min-w-9 flex-1 items-center justify-center rounded-md text-foreground active:bg-accent active:text-accent-foreground [&_svg]:size-5"
    >
      {children}
    </button>
  )
}
