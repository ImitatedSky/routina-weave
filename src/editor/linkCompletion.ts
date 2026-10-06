import { pickedCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { useNotes, pathOf } from '@/store/notes'
import { normalizeTitle } from '@/notes/links'
import type { Note } from '@/notes/types'
import { inCode } from './syntax'

export interface LinkOption {
  title: string
  /** 同名的筆記用上層路徑區分 */
  detail?: string
  /** 「建立新頁面」那一項 */
  create?: boolean
}

/**
 * 打 [[ 之後的候選標題。完全相同的排最前、開頭相同的其次，同一級裡最近改過的在前。
 * 輸入的字不是現有標題時，最後多一項「建立新頁面」。
 */
export function linkOptions(notes: Record<string, Note>, query: string): LinkOption[] {
  const q = normalizeTitle(query)
  const list = Object.values(notes).filter((n) => !n.template && n.title.trim())

  const sameTitle = new Map<string, number>()
  for (const n of list) {
    const key = normalizeTitle(n.title)
    sameTitle.set(key, (sameTitle.get(key) ?? 0) + 1)
  }

  const rank = (n: Note) => {
    const key = normalizeTitle(n.title)
    if (key === q) return 0
    return key.startsWith(q) ? 1 : 2
  }
  const matched = list
    .filter((n) => normalizeTitle(n.title).includes(q))
    .sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated))

  const options: LinkOption[] = matched.map((n) => ({
    title: n.title,
    detail: sameTitle.get(normalizeTitle(n.title))! > 1 ? parentPath(notes, n.id) : undefined,
  }))
  if (q && !sameTitle.has(q)) options.push({ title: query.trim(), create: true })
  return options
}

function parentPath(notes: Record<string, Note>, id: string): string {
  const parents = pathOf(notes, id).slice(0, -1)
  return parents.length ? parents.map((n) => n.title).join(' / ') : '最上層'
}

/**
 * 選了標題之後要插入的文字。after 是游標後面同一行的字：
 * 後面已經有 ]] 就連同中間打到一半的字一起換掉，不要變成 ]]]]；
 * 有別名（|）就只換掉標題的部分。replace 是要吃掉游標後面幾個字。
 */
export function linkInsertion(title: string, after: string): { insert: string; replace: number } {
  const closed = /^[^[\]\n|]*\]\]/.exec(after)
  if (closed) return { insert: title + ']]', replace: closed[0].length }
  const aliased = /^[^[\]\n|]*(?=\|[^[\]\n]*\]\])/.exec(after)
  if (aliased) return { insert: title, replace: aliased[0].length }
  return { insert: title + ']]', replace: 0 }
}

function applyLink(view: EditorView, title: string, completion: Completion, from: number, to: number) {
  const after = view.state.sliceDoc(to, view.state.doc.lineAt(to).to)
  const { insert, replace } = linkInsertion(title, after)
  view.dispatch({
    changes: { from, to: to + replace, insert },
    selection: { anchor: from + insert.length },
    annotations: pickedCompletion.of(completion),
    userEvent: 'input.complete',
    scrollIntoView: true,
  })
}

export function linkSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\[\[[^[\]\n|]*$/)
  if (!match) return null
  if (inCode(context.state, match.from)) return null

  const options = linkOptions(useNotes.getState().notes, match.text.slice(2))
  if (!options.length) return null
  return {
    from: match.from + 2,
    filter: false,
    options: options.map((option) => ({
      label: option.create ? `建立新頁面：${option.title}` : option.title,
      detail: option.detail,
      apply: (view, completion, from, to) => applyLink(view, option.title, completion, from, to),
    })),
  }
}
