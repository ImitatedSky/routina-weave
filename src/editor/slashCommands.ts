import { pickedCompletion, startCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { inCode } from './syntax'

/**
 * Notion 風的 / 選單：在行首或空白後打 /，選一項就把 /xxx 換成對應的 Markdown。
 */
export interface SlashCommand {
  label: string
  /** 英文關鍵字，跟中文名稱一起拿來篩選 */
  keywords: string[]
  /** 選單右邊的提示 */
  hint: string
  text: string
  /** 插完之後游標在 text 裡的位置，沒給就放最後 */
  cursor?: number
  /** inline：原地插入；line：要在一行的開頭；block：前面還要空一行（分隔線、表格） */
  placement: 'inline' | 'line' | 'block'
  /** 插完接著打開 [[ 自動完成 */
  thenComplete?: boolean
}

const TABLE_HEAD = '| 欄位 1 | 欄位 2 |\n| --- | --- |\n| '

export function slashCommands(now = new Date()): SlashCommand[] {
  return [
    { label: '標題 1', keywords: ['h1', 'heading', 'title'], hint: '#', text: '# ', placement: 'line' },
    { label: '標題 2', keywords: ['h2', 'heading'], hint: '##', text: '## ', placement: 'line' },
    { label: '標題 3', keywords: ['h3', 'heading'], hint: '###', text: '### ', placement: 'line' },
    { label: '項目清單', keywords: ['bullet', 'list', 'ul'], hint: '-', text: '- ', placement: 'line' },
    { label: '編號清單', keywords: ['number', 'list', 'ol'], hint: '1.', text: '1. ', placement: 'line' },
    { label: '待辦', keywords: ['todo', 'task', 'checkbox'], hint: '- [ ]', text: '- [ ] ', placement: 'line' },
    { label: '引用', keywords: ['quote', 'blockquote'], hint: '>', text: '> ', placement: 'line' },
    { label: '提示框', keywords: ['callout', 'note'], hint: '> [!note]', text: '> [!note] ', placement: 'line' },
    { label: '程式碼區塊', keywords: ['code', 'pre'], hint: '```', text: '```\n\n```', cursor: 4, placement: 'line' },
    { label: '分隔線', keywords: ['divider', 'hr', 'line'], hint: '---', text: '---\n', placement: 'block' },
    {
      label: '表格',
      keywords: ['table'],
      hint: '| |',
      text: TABLE_HEAD + ' |  |',
      cursor: TABLE_HEAD.length,
      placement: 'block',
    },
    { label: '連結到頁面', keywords: ['link', 'page', 'wiki'], hint: '[[', text: '[[', placement: 'inline', thenComplete: true },
    { label: '今天日期', keywords: ['date', 'today'], hint: formatDate(now), text: formatDate(now), placement: 'inline' },
  ]
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 用中文名稱或英文關鍵字篩選，不分大小寫。開頭就相同的排前面 */
export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  const words = (cmd: SlashCommand) => [cmd.label.toLowerCase(), ...cmd.keywords]
  const prefix = commands.filter((cmd) => words(cmd).some((w) => w.startsWith(q)))
  const contains = commands.filter((cmd) => !prefix.includes(cmd) && words(cmd).some((w) => w.includes(q)))
  return [...prefix, ...contains]
}

/**
 * 選了指令之後要插入的文字。
 * before 是同一行 / 前面的字，prevBlank 是上一行是不是空的（第一行也算）。
 * 回傳的 cursor 是相對於插入起點的位置。
 */
export function slashEdit(cmd: SlashCommand, before: string, prevBlank: boolean): { insert: string; cursor: number } {
  const lineEmpty = before.trim() === ''
  let prefix = ''
  if (cmd.placement === 'line' && !lineEmpty) prefix = '\n'
  // --- 緊接在文字下一行會變成標題（Setext），表格也要獨立一段
  if (cmd.placement === 'block') prefix = lineEmpty ? (prevBlank ? '' : '\n') : '\n\n'
  return { insert: prefix + cmd.text, cursor: prefix.length + (cmd.cursor ?? cmd.text.length) }
}

function applySlash(view: EditorView, cmd: SlashCommand, completion: Completion, from: number, to: number) {
  const { doc } = view.state
  const line = doc.lineAt(from)
  const before = doc.sliceString(line.from, from)
  const prevBlank = line.number === 1 || doc.line(line.number - 1).text.trim() === ''
  const { insert, cursor } = slashEdit(cmd, before, prevBlank)
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + cursor },
    annotations: pickedCompletion.of(completion),
    userEvent: 'input.complete',
    scrollIntoView: true,
  })
  if (cmd.thenComplete) startCompletion(view)
}

export function slashSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\/[^\s/]*$/)
  if (!match) return null
  const line = context.state.doc.lineAt(match.from)
  const before = context.state.sliceDoc(line.from, match.from)
  // 網址、路徑裡的 / 不要跳選單
  if (before && !/\s$/.test(before)) return null
  if (inCode(context.state, match.from)) return null

  const commands = filterSlashCommands(slashCommands(), match.text.slice(1))
  if (!commands.length) return null
  return {
    from: match.from,
    filter: false,
    options: commands.map((cmd) => ({
      label: cmd.label,
      detail: cmd.hint,
      apply: (view, completion, from, to) => applySlash(view, cmd, completion, from, to),
    })),
  }
}
