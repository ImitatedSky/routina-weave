import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { weaveTheme, weaveHighlight } from './theme'

export interface MarkdownEditorProps {
  /** 換頁時換 key 重建編輯器；同一頁內 value 只當初始值 */
  value: string
  onChange: (value: string) => void
  /** 點 [[連結]]（Ctrl/⌘+點或在即時預覽中點）時呼叫 */
  onOpenLink?: (title: string) => void
}

/**
 * CodeMirror 6 的 Markdown 編輯器。原文一個字都不改寫，存回去的就是使用者打的內容。
 */
export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(weaveHighlight),
          weaveTheme,
          EditorView.lineWrapping,
          placeholder('開始寫…'),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    return () => view.destroy()
    // value 只當初始值，換頁由外層換 key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={host} className="min-h-[40vh]" />
}
