import { useCallback } from 'react'
import { useNotes } from '@/store/notes'
import { titleIndex, normalizeTitle } from '@/notes/links'
import { navigate } from '@/store/route'

/** 打開 [[標題]]：找得到就跳過去，找不到就用這個標題建立新頁面（Obsidian 的做法） */
export function useOpenLink() {
  return useCallback((title: string) => {
    const { notes, createNote } = useNotes.getState()
    const id = titleIndex(Object.values(notes)).get(normalizeTitle(title))
    if (id) {
      navigate({ kind: 'page', id })
      return
    }
    const note = createNote({ title: title.trim(), parent: null })
    navigate({ kind: 'page', id: note.id })
  }, [])
}
