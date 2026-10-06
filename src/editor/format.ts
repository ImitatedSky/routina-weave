import { EditorSelection, type ChangeSpec, type StateCommand, type Text } from '@codemirror/state'

/** pos 往前（dir = -1）或往後（dir = 1）連續幾個 * ，最多數到 3 */
function starRun(doc: Text, pos: number, dir: -1 | 1): number {
  let n = 0
  while (n < 3) {
    const from = dir < 0 ? pos - n - 1 : pos + n
    if (from < 0 || from >= doc.length || doc.sliceString(from, from + 1) !== '*') break
    n++
  }
  return n
}

/** 兩側各有 run 個 * 時，算不算已經是粗體（**）或斜體（*）。*** 兩種都算 */
function isWrapped(run: number, marker: '**' | '*'): boolean {
  return marker === '**' ? run >= 2 : run % 2 === 1
}

/**
 * 粗體／斜體開關：選取範圍外面已經包著記號就拿掉，否則包起來。
 * 沒選字時插一對記號、游標放中間；游標在空的一對記號中間時把它拿掉。
 */
export function toggleWrap(marker: '**' | '*'): StateCommand {
  const len = marker.length
  return ({ state, dispatch }) => {
    const tr = state.changeByRange((range) => {
      const run = Math.min(starRun(state.doc, range.from, -1), starRun(state.doc, range.to, 1))
      if (isWrapped(run, marker)) {
        return {
          changes: [
            { from: range.from - len, to: range.from },
            { from: range.to, to: range.to + len },
          ],
          range: EditorSelection.range(range.from - len, range.to - len),
        }
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + len, range.to + len),
      }
    })
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }))
    return true
  }
}

export type BlockKind = 'heading' | 'bullet' | 'task'

const LINE_PREFIX = /^(\s*)(#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+[.)] |> )?/

/** 一行開頭的縮排和區塊記號（標題、清單、待辦、引用） */
export function splitPrefix(line: string): { indent: string; marker: string } {
  const m = LINE_PREFIX.exec(line)!
  return { indent: m[1], marker: m[2] ?? '' }
}

/**
 * 按一次工具列按鈕後的行首記號。
 * 標題：無 → # → ## → ### → 無；清單、待辦：有就拿掉，沒有就換成這種。
 */
export function nextMarker(marker: string, kind: BlockKind): string {
  if (kind === 'heading') {
    const level = /^(#+) $/.exec(marker)?.[1].length ?? 0
    if (level === 0) return '# '
    return level < 3 ? '#'.repeat(level + 1) + ' ' : ''
  }
  if (kind === 'task') return /^[-*+] \[/.test(marker) ? '' : '- [ ] '
  return /^[-*+] $/.test(marker) ? '' : '- '
}

/** 把選取範圍碰到的每一行切換成標題／清單／待辦 */
export function toggleBlock(kind: BlockKind): StateCommand {
  return ({ state, dispatch }) => {
    const changes: ChangeSpec[] = []
    let lastLine = 0
    for (const range of state.selection.ranges) {
      let pos = range.from
      while (pos <= range.to) {
        const line = state.doc.lineAt(pos)
        if (line.number > lastLine) {
          const { indent, marker } = splitPrefix(line.text)
          const from = line.from + indent.length
          changes.push({ from, to: from + marker.length, insert: nextMarker(marker, kind) })
          lastLine = line.number
        }
        pos = line.to + 1
      }
    }
    const changeSet = state.changes(changes)
    // 游標在行首時要跟著跑到新記號後面，所以用 assoc = 1
    dispatch(state.update({ changes: changeSet, selection: state.selection.map(changeSet, 1), scrollIntoView: true, userEvent: 'input' }))
    return true
  }
}

/**
 * 待辦這一行的 [ ] / [x] 切換成另一個狀態。
 * 回傳要改的字在這一行的位置和新的字；不是待辦就回傳 null。
 */
export function taskToggle(line: string): { offset: number; insert: string } | null {
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(line)
  if (!m) return null
  return { offset: m[1].length, insert: m[2] === ' ' ? 'x' : ' ' }
}
