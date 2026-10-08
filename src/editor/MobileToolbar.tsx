import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { Bold, Heading, Italic, KeyboardOff, List, ListTodo, Palette, Redo2, Slash, Undo2 } from 'lucide-react'
import { startCompletion } from '@codemirror/autocomplete'
import { redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { clearColor, toggleBlock, toggleWrap, wrapColor } from './format'
import { BG_COLORS, TEXT_COLORS, colorTags, type ColorChoice, type ColorKind } from '@/notes/colors'

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
  const [paletteOpen, setPaletteOpen] = useState(false)

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
      className="fixed inset-x-0 z-20 hidden gap-0.5 border-t bg-background/95 px-1 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur pointer-coarse:flex"
    >
      {paletteOpen && (
        <ColorPalette
          onPick={(kind, choice) => {
            const { open, close } = colorTags(kind, choice.value)
            run((view) => wrapColor(open, close)(view))
            setPaletteOpen(false)
          }}
          onClear={() => {
            run((view) => clearColor(view))
            setPaletteOpen(false)
          }}
        />
      )}
      {ACTIONS.map((action) => (
        <ToolbarButton key={action.label} label={action.label} onPress={() => run(action.run)}>
          {action.icon}
        </ToolbarButton>
      ))}
      <ToolbarButton label="文字顏色" onPress={() => setPaletteOpen(!paletteOpen)}>
        <Palette />
      </ToolbarButton>
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
      className="flex h-10 min-w-8 flex-1 items-center justify-center rounded-md text-foreground active:bg-accent active:text-accent-foreground [&_svg]:size-5"
    >
      {children}
    </button>
  )
}

/** 工具列上方的色盤：先選字再點顏色；沒選字就插入一對標籤，接著打的字會是那個顏色 */
function ColorPalette({ onPick, onClear }: { onPick: (kind: ColorKind, choice: ColorChoice) => void; onClear: () => void }) {
  const swatch = 'flex size-9 shrink-0 items-center justify-center rounded-md border text-base font-semibold'
  return (
    <div className="absolute inset-x-0 bottom-full border-t bg-background/95 px-2 py-2 backdrop-blur">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>文字顏色</span>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClear} className="rounded-md border px-3 py-1.5 text-sm">
          清除顏色
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {TEXT_COLORS.map((c) => (
          <button key={c.id} type="button" aria-label={`${c.label}文字`} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick('text', c)} className={swatch} style={{ color: c.value }}>
            A
          </button>
        ))}
      </div>
      <div className="mt-2 mb-1 text-xs text-muted-foreground">背景顏色</div>
      <div className="flex gap-1 overflow-x-auto">
        {BG_COLORS.map((c) => (
          <button key={c.id} type="button" aria-label={c.label} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick('bg', c)} className={swatch} style={{ background: c.value, borderColor: 'transparent' }}>
            A
          </button>
        ))}
      </div>
    </div>
  )
}
