import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { autocompletion } from '@codemirror/autocomplete'
import { weaveTheme, weaveHighlight } from './theme'
import { livePreview } from './livePreview'
import { linkSource } from './linkCompletion'
import { slashSource } from './slashCommands'
import { toggleWrap } from './format'
import { MobileToolbar } from './MobileToolbar'

export interface MarkdownEditorProps {
  /** 換頁時換 key 重建編輯器；同一頁內 value 只當初始值 */
  value: string
  onChange: (value: string) => void
  /** 點 [[連結]]（Ctrl/⌘+點或在即時預覽中點）時呼叫 */
  onOpenLink?: (title: string) => void
}

/**
 * CodeMirror 6 的 Markdown 編輯器。原文一個字都不改寫，存回去的就是使用者打的內容；
 * 即時預覽只是裝飾。
 */
export function MarkdownEditor({ value, onChange, onOpenLink }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [focused, setFocused] = useState(false)

  // 編輯器只建一次，callback 透過 ref 拿最新的
  const onChangeRef = useRef(onChange)
  const onOpenLinkRef = useRef(onOpenLink)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
    onOpenLinkRef.current = onOpenLink
  })

  useEffect(() => {
    const coarse = matchMedia('(pointer: coarse)').matches
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          keymap.of([
            { key: 'Mod-b', run: toggleWrap('**') },
            { key: 'Mod-i', run: toggleWrap('*') },
            // Enter 在清單、待辦、引用裡自動接下一個記號
            ...markdownKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          markdown({ base: markdownLanguage, addKeymap: false }),
          syntaxHighlighting(weaveHighlight),
          autocompletion({ override: [linkSource, slashSource], icons: false }),
          livePreview((title) => onOpenLinkRef.current?.(title)),
          weaveTheme,
          EditorView.lineWrapping,
          placeholder('開始寫，或打 / 插入區塊'),
          // 手機底部有工具列，捲動游標時別讓它被擋住
          coarse ? EditorView.scrollMargins.of(() => ({ bottom: 64 })) : [],
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
            if (update.focusChanged) setFocused(update.view.hasFocus)
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
    // value 只當初始值，換頁由外層換 key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div ref={host} className="min-h-32" />
      {focused && <MobileToolbar viewRef={viewRef} />}
    </>
  )
}
