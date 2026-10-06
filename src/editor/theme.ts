import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/** 顏色全部取 CSS 變數，深淺色切換時不用重建編輯器 */
export const weaveTheme = EditorView.theme({
  '&': {
    fontSize: '16px',
    color: 'var(--foreground)',
    backgroundColor: 'transparent',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': {
    fontFamily: 'var(--font-sans)',
    lineHeight: '1.75',
    padding: '0 0 1.5rem',
    caretColor: 'var(--primary)',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--primary)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklch, var(--primary) 22%, transparent) !important',
  },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    overflow: 'hidden',
  },

  // ---- 自動完成（[[ 與 / 選單）----
  // 前面加 &.cm-editor 才蓋得過 autocomplete 內建的藍底白字
  '&.cm-editor .cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-sans)',
    maxHeight: '18em',
    minWidth: '220px',
    padding: '4px',
  },
  '&.cm-editor .cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '6px 10px',
    borderRadius: '6px',
    lineHeight: '1.4',
  },
  '&.cm-editor .cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    background: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  '.cm-completionDetail': {
    marginLeft: '1em',
    fontStyle: 'normal',
    fontSize: '0.85em',
    color: 'var(--muted-foreground)',
  },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '600' },

  // ---- 即時預覽 ----
  '.cm-lp-wikilink': {
    background: 'var(--accent)',
    color: 'var(--accent-foreground)',
    borderRadius: '4px',
    padding: '0 4px',
    cursor: 'pointer',
  },
  '.cm-lp-wikilink.cm-lp-missing': {
    background: 'transparent',
    color: 'var(--muted-foreground)',
    outline: '1px dashed var(--border)',
    outlineOffset: '-1px',
  },
  '.cm-lp-wikilink-raw': { color: 'var(--link)' },
  '.cm-lp-link': {
    color: 'var(--link)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    cursor: 'pointer',
  },
  '.cm-lp-inline-code': {
    background: 'var(--muted)',
    borderRadius: '4px',
    padding: '0.1em 0.35em',
  },
  '.cm-lp-bullet': {
    display: 'inline-block',
    width: '1em',
    textAlign: 'center',
    color: 'var(--muted-foreground)',
  },
  '.cm-lp-task': {
    width: '1em',
    height: '1em',
    margin: '0 0.4em 0 0',
    verticalAlign: '-0.15em',
    accentColor: 'var(--primary)',
    cursor: 'pointer',
  },
  '.cm-lp-hr': {
    display: 'inline-block',
    width: '100%',
    verticalAlign: 'middle',
    borderTop: '1px solid var(--border)',
  },
  '.cm-line.cm-lp-quote': {
    borderLeft: '3px solid var(--border)',
    paddingLeft: '1em',
    color: 'var(--muted-foreground)',
  },
  '.cm-line.cm-lp-callout': {
    borderLeft: '4px solid var(--primary)',
    background: 'var(--accent)',
    color: 'var(--foreground)',
  },
  '.cm-lp-callout-title': { fontWeight: '600' },
  '.cm-line.cm-lp-codeblock': {
    background: 'var(--muted)',
    padding: '0 1em',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.9em',
  },
})

export const weaveHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.6em', fontWeight: '700' },
  { tag: t.heading2, fontSize: '1.3em', fontWeight: '650' },
  { tag: t.heading3, fontSize: '1.1em', fontWeight: '600' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '600' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--link)' },
  { tag: t.url, color: 'var(--muted-foreground)' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
  { tag: t.quote, color: 'var(--muted-foreground)' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--muted-foreground)' },
])
