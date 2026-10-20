import { fetchLinkPreview, siteOf } from '@/lib/linkPreview'
import { putAttachment } from '@/storage/db'
import { useNotes } from '@/store/notes'
import type { Note } from './types'

/** 補上 https://，不是網址就回傳 null */
export function normalizeUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * 筆記的 url 可能來自匯入的 zip 或雲端（frontmatter 寫什麼都有），放進 <a href> 或開啟前先檢查：
 * 只放行 http(s)，其他（javascript:、data:、intent:…）回傳 undefined。不補 https://
 */
export function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/**
 * 先用網域當標題建立筆記並立刻回傳，背景再抓預覽補上標題、說明、縮圖。
 * 抓不到也沒關係，筆記照樣可用。
 */
export function addBookmark(url: string, parent: string | null): Note {
  const { createNote } = useNotes.getState()
  const site = siteOf(url)
  const note = createNote({ title: site ?? url, url, site, parent, templateId: null })
  void fetchLinkPreview(url)
    .then(async (preview) => {
      const patch: Partial<Note> = {}
      const current = useNotes.getState().notes[note.id]
      if (!current) return
      // 使用者已經改過標題就不要蓋掉
      if (preview.title && current.title === note.title) patch.title = preview.title
      if (preview.description) patch.description = preview.description
      if (preview.site) patch.site = preview.site
      if (preview.image) {
        const id = crypto.randomUUID()
        await putAttachment({ id, blob: preview.image, type: preview.image.type })
        patch.image = id
      }
      if (Object.keys(patch).length) useNotes.getState().updateNote(note.id, patch)
    })
    .catch(() => {})
  return note
}
