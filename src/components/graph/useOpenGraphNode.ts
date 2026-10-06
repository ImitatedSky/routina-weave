import { useNotes } from '@/store/notes'
import { navigate } from '@/store/route'
import type { GraphNode } from '@/notes/graphData'

/** 點圖譜節點：筆記跳頁、標籤看標籤頁、未建立的連結就建立那一頁（跟 Obsidian 一樣） */
export function useOpenGraphNode() {
  const createNote = useNotes((s) => s.createNote)
  return (node: GraphNode) => {
    if (node.kind === 'note') navigate({ kind: 'page', id: node.id })
    else if (node.kind === 'tag') navigate({ kind: 'tag', tag: node.label })
    else navigate({ kind: 'page', id: createNote({ title: node.label }).id })
  }
}
