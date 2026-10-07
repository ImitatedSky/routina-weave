import {
  completionStatus, pickedCompletion, startCompletion,
  type Completion, type CompletionContext, type CompletionResult, type CompletionSection,
} from '@codemirror/autocomplete'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import { inCode } from './syntax'
import { useNotes } from '@/store/notes'
import { useUi } from '@/store/ui'
import { navigate, parseRoute } from '@/store/route'
import { titleIndex, normalizeTitle } from '@/notes/links'

/**
 * Notion 風的 / 選單：在行首或空白後打 /（中文輸入法的全形「／」也算），
 * 選一項就把 /xxx 換成對應的 Markdown。
 */
export interface SlashCommand {
  label: string
  section: SectionName
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
  /** 不是單純插字的指令：建立子頁面、新增網址 */
  action?: 'subpage' | 'bookmark'
}

type SectionName = '基本' | '清單' | '區塊' | '提示框' | '連結與媒體' | '行內格式' | '日期時間'

// 選單依 Notion 的分組排列，rank 決定上下順序
const SECTIONS: Record<SectionName, CompletionSection> = {
  基本: { name: '基本', rank: 0 },
  清單: { name: '清單', rank: 1 },
  區塊: { name: '區塊', rank: 2 },
  提示框: { name: '提示框', rank: 3 },
  連結與媒體: { name: '連結與媒體', rank: 4 },
  行內格式: { name: '行內格式', rank: 5 },
  日期時間: { name: '日期時間', rank: 6 },
}

const TABLE_HEAD = '| 欄位 1 | 欄位 2 |\n| --- | --- |\n| '

function callout(label: string, type: string, keywords: string[]): SlashCommand {
  const text = `> [!${type}] `
  return { label, section: '提示框', keywords: ['callout', type, ...keywords], hint: `[!${type}]`, text, placement: 'line' }
}

export function slashCommands(now = new Date()): SlashCommand[] {
  const date = formatDate(now)
  const time = formatTime(now)
  return [
    { label: '標題 1', section: '基本', keywords: ['h1', 'heading', 'title'], hint: '#', text: '# ', placement: 'line' },
    { label: '標題 2', section: '基本', keywords: ['h2', 'heading'], hint: '##', text: '## ', placement: 'line' },
    { label: '標題 3', section: '基本', keywords: ['h3', 'heading'], hint: '###', text: '### ', placement: 'line' },
    { label: '子頁面', section: '基本', keywords: ['page', 'subpage', 'new', '頁面'], hint: '新增並開啟', text: '', placement: 'inline', action: 'subpage' },
    {
      label: '連結到頁面 [[ ]]',
      section: '基本',
      keywords: ['link', 'page', 'wiki', 'mention', '[[', '引用', '提及'],
      hint: '[[ ]]',
      text: '[[]]',
      cursor: 2,
      placement: 'inline',
      thenComplete: true,
    },

    { label: '項目清單', section: '清單', keywords: ['bullet', 'list', 'ul'], hint: '-', text: '- ', placement: 'line' },
    { label: '編號清單', section: '清單', keywords: ['number', 'list', 'ol'], hint: '1.', text: '1. ', placement: 'line' },
    { label: '待辦', section: '清單', keywords: ['todo', 'task', 'checkbox', '待辦事項'], hint: '- [ ]', text: '- [ ] ', placement: 'line' },

    { label: '分隔線', section: '區塊', keywords: ['divider', 'hr', 'line', 'separator', '---'], hint: '---', text: '---\n', placement: 'block' },
    { label: '引用', section: '區塊', keywords: ['quote', 'blockquote'], hint: '>', text: '> ', placement: 'line' },
    {
      label: '摺疊區塊',
      section: '區塊',
      keywords: ['toggle', 'fold', 'collapse', 'details', '收合'],
      hint: '點標題展開',
      text: '> [!note]- 標題\n> 內容',
      cursor: '> [!note]- 標題'.length,
      placement: 'line',
    },
    { label: '程式碼區塊', section: '區塊', keywords: ['code', 'pre', '```'], hint: '```', text: '```\n\n```', cursor: 4, placement: 'line' },
    {
      label: '表格',
      section: '區塊',
      keywords: ['table', 'grid'],
      hint: '| |',
      text: TABLE_HEAD + ' |  |',
      cursor: TABLE_HEAD.length,
      placement: 'block',
    },

    callout('提示框', 'note', ['note', '筆記']),
    callout('提示框・小技巧', 'tip', ['tip', 'hint', '提示']),
    callout('提示框・資訊', 'info', ['info']),
    callout('提示框・注意', 'warning', ['warning', 'caution', '警告']),
    callout('提示框・危險', 'danger', ['danger', 'error', '錯誤']),
    callout('提示框・問題', 'question', ['question', 'faq', 'help']),

    { label: '網址書籤', section: '連結與媒體', keywords: ['bookmark', 'url', 'web', '網址', '收藏'], hint: '抓標題與縮圖', text: '', placement: 'inline', action: 'bookmark' },
    { label: '連結', section: '連結與媒體', keywords: ['link', 'url', 'href'], hint: '[文字](網址)', text: '[](https://)', cursor: 1, placement: 'inline' },
    { label: '圖片', section: '連結與媒體', keywords: ['image', 'img', 'picture', 'photo', '照片'], hint: '![](網址)', text: '![](https://)', cursor: 4, placement: 'inline' },

    { label: '粗體', section: '行內格式', keywords: ['bold', 'strong', 'b'], hint: '**', text: '****', cursor: 2, placement: 'inline' },
    { label: '斜體', section: '行內格式', keywords: ['italic', 'em', 'i'], hint: '*', text: '**', cursor: 1, placement: 'inline' },
    { label: '刪除線', section: '行內格式', keywords: ['strike', 'strikethrough', 'del'], hint: '~~', text: '~~~~', cursor: 2, placement: 'inline' },
    { label: '行內程式碼', section: '行內格式', keywords: ['code', 'inline'], hint: '`', text: '``', cursor: 1, placement: 'inline' },
    { label: '標籤', section: '行內格式', keywords: ['tag', 'hashtag', '#'], hint: '#', text: '#', placement: 'inline' },

    { label: '今天日期', section: '日期時間', keywords: ['date', 'today', '日期'], hint: date, text: date, placement: 'inline' },
    { label: '現在時間', section: '日期時間', keywords: ['time', 'now', '時間'], hint: time, text: time, placement: 'inline' },
    { label: '日期與時間', section: '日期時間', keywords: ['datetime', 'timestamp'], hint: `${date} ${time}`, text: `${date} ${time}`, placement: 'inline' },
  ]
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 用中文名稱或英文關鍵字篩選，不分大小寫。開頭就相同的排前面 */
export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  const words = (cmd: SlashCommand) => [cmd.label.toLowerCase(), cmd.section, ...cmd.keywords]
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

/** 「新頁面」已經有了就用「新頁面 2」、「新頁面 3」…，[[連結]] 才不會連錯 */
export function uniqueTitle(base: string, taken: (title: string) => boolean): string {
  if (!taken(base)) return base
  let n = 2
  while (taken(`${base} ${n}`)) n++
  return `${base} ${n}`
}

function currentPageId(): string | null {
  const route = parseRoute(location.hash)
  return route.kind === 'page' ? route.id : null
}

function applySlash(view: EditorView, cmd: SlashCommand, completion: Completion, from: number, to: number) {
  if (cmd.action === 'subpage') {
    // 跟 Notion 一樣：在這裡留一個連結，然後打開新的子頁面
    const { notes, createNote } = useNotes.getState()
    const index = titleIndex(Object.values(notes))
    const title = uniqueTitle('新頁面', (t) => index.has(normalizeTitle(t)))
    const note = createNote({ title, parent: currentPageId() })
    view.dispatch({
      changes: { from, to, insert: `[[${title}]]` },
      annotations: pickedCompletion.of(completion),
      userEvent: 'input.complete',
    })
    navigate({ kind: 'page', id: note.id })
    return
  }
  if (cmd.action === 'bookmark') {
    view.dispatch({ changes: { from, to, insert: '' }, annotations: pickedCompletion.of(completion), userEvent: 'input.complete' })
    useUi.getState().openBookmark(currentPageId())
    return
  }

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

const SLASH_BEFORE = /[/／][^\s/／]*$/

/** 游標前面是不是一個可以叫出選單的 /：在行首或空白後，而且不在程式碼裡 */
export function slashMatchAt(state: EditorView['state'], pos: number): { from: number; query: string } | null {
  const line = state.doc.lineAt(pos)
  const text = state.sliceDoc(line.from, pos)
  const m = SLASH_BEFORE.exec(text)
  if (!m) return null
  const before = text.slice(0, m.index)
  // 網址、路徑裡的 / 不要跳選單
  if (before && !/\s$/.test(before)) return null
  const from = line.from + m.index
  if (inCode(state, from)) return null
  return { from, query: m[0].slice(1) }
}

export function slashSource(context: CompletionContext): CompletionResult | null {
  const match = slashMatchAt(context.state, context.pos)
  if (!match) return null
  const commands = filterSlashCommands(slashCommands(), match.query)
  if (!commands.length) return null
  return {
    from: match.from,
    filter: false,
    options: commands.map((cmd, i) => ({
      label: cmd.label,
      detail: cmd.hint,
      section: SECTIONS[cmd.section],
      // filter 關掉後 CodeMirror 依 boost 排序；照我們篩選出來的順序給分
      boost: 99 - i,
      apply: (view, completion, from, to) => applySlash(view, cmd, completion, from, to),
    })),
  }
}

/**
 * CodeMirror 只在「打字」事件時自動叫出選單。Android 輸入法的選字、自動修正、
 * 手機工具列插入的 / 都不算打字，所以剛插入 / 時這裡補叫一次。
 */
export const slashTrigger = EditorView.updateListener.of((update: ViewUpdate) => {
  if (!update.docChanged || update.transactions.some((tr) => tr.isUserEvent('input.complete'))) return
  const { state } = update
  const pos = state.selection.main.head
  if (!state.selection.main.empty || pos === 0) return
  const last = state.sliceDoc(pos - 1, pos)
  if (last !== '/' && last !== '／') return
  if (!slashMatchAt(state, pos) || completionStatus(state) !== null) return
  // 不能在 update 裡面再 dispatch，排到下一輪
  setTimeout(() => {
    if (completionStatus(update.view.state) === null) startCompletion(update.view)
  })
})
