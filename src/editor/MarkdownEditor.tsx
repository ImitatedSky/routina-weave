import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Annotation, EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap, placeholder, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { autocompletion } from '@codemirror/autocomplete'
import { weaveTheme, weaveHighlight } from './theme'
import { livePreview } from './livePreview'
import { colorPreview } from './colorPreview'
import { cardWidgets, cardWidgetStyles } from './cardWidget'
import { pasteLink } from './pasteLink'
import { pasteImage } from './imageUpload'
import { imagePreview, imagePreviewStyles } from './imagePreview'
import { linkSource } from './linkCompletion'
import { slashSource, slashTrigger } from './slashCommands'
import { renderSlashRule, renderSlashTile, slashMenuStyles, slashOptionClass } from './slashLook'
import { toggleWrap } from './format'
import { MobileToolbar } from './MobileToolbar'

export interface MarkdownEditorProps {
  /**
   * 外層存好的內容。換頁時換 key 重建編輯器；同一頁內 value 被外部改掉（例如雲端同步下載了新版）
   * 會換掉編輯器內容，但使用者還有沒存回去的字時保留編輯器裡的
   */
  value: string
  onChange: (value: string) => void
  /** 點 [[連結]]（Ctrl/⌘+點或在即時預覽中點）時呼叫 */
  onOpenLink?: (title: string) => void
}

/** 標記從 value 換進來的內容，不是使用者打的，不要再 onChange 回去 */
const External = Annotation.define<boolean>()

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
          autocompletion({
            override: [linkSource, slashSource],
            icons: false,
            optionClass: slashOptionClass,
            addToOptions: [
              { render: renderSlashTile, position: 20 },
              { render: renderSlashRule, position: 90 },
            ],
          }),
          EditorView.theme(slashMenuStyles),
          slashTrigger,
          livePreview((title) => onOpenLinkRef.current?.(title)),
          colorPreview,
          cardWidgets,
          cardWidgetStyles,
          pasteImage,
          pasteLink,
          imagePreview,
          imagePreviewStyles,
          weaveTheme,
          EditorView.lineWrapping,
          placeholder('開始寫，或打 / 插入區塊'),
          // 手機底部有工具列，捲動游標時別讓它被擋住。只扣掉編輯器真的被工具列蓋住的那一段：
          // CodeMirror 也用這個值判斷選單要不要顯示，固定扣 64px 的話，游標在最後幾行時
          // 會被當成「看不到」而把 / 選單藏起來
          coarse ? EditorView.scrollMargins.of(toolbarOverlap) : [],
          EditorView.updateListener.of((update) => {
            const external = update.transactions.some((tr) => tr.annotation(External))
            if (update.docChanged && !external) onChangeRef.current(update.state.doc.toString())
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
    // 建立時的 value 當初始內容，之後的變化由下面的 effect 處理；換頁由外層換 key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 上一次收到的 value，也就是外層已經存好的內容。編輯器內容跟它不一樣就是還有字沒存
  const savedRef = useRef(value)
  useEffect(() => {
    const view = viewRef.current
    if (!view || value === savedRef.current) return
    const doc = view.state.doc.toString()
    const dirty = doc !== savedRef.current
    savedRef.current = value
    // 有沒存的字就不換：外層存回剛打的字時也是走這裡；
    // 外部改的話讓本機的字照常存回去，外層再決定要不要把外部的版本另存（PageView 會存成衝突副本）
    if (dirty) return
    const { anchor, head } = view.state.selection.main
    view.dispatch({
      changes: { from: 0, to: doc.length, insert: value },
      selection: { anchor: Math.min(anchor, value.length), head: Math.min(head, value.length) },
      annotations: [External.of(true), Transaction.addToHistory.of(false)],
    })
  }, [value])

  return (
    <>
      <div ref={host} className="min-h-32" />
      {focused && <MobileToolbar viewRef={viewRef} />}
    </>
  )
}

/** 底部工具列（約 56px 高，鍵盤彈出時 Android 殼會縮小視窗，所以以視窗底部為準）蓋住編輯器的高度 */
const TOOLBAR_HEIGHT = 56

function toolbarOverlap(view: EditorView) {
  const bottom = view.scrollDOM.getBoundingClientRect().bottom
  const viewportBottom = window.visualViewport?.height ?? window.innerHeight
  return { bottom: Math.max(0, bottom - (viewportBottom - TOOLBAR_HEIGHT)) }
}
