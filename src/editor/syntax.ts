import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

const CODE_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText'])

/** pos 這個字在程式碼裡嗎？程式碼裡的 [[ 和 / 都只是普通文字 */
export function inCode(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, 1)
  while (true) {
    if (CODE_NODES.has(node.name)) return true
    if (!node.parent) return false
    node = node.parent
  }
}
