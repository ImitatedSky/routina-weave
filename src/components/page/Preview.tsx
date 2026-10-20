import { useEffect, useMemo, useRef } from 'react'
import { renderMarkdown, toggleTask } from '@/notes/render'
import { useNotes } from '@/store/notes'
import { titleIndex, normalizeTitle } from '@/notes/links'
import { useOpenLink } from './useOpenLink'
import { fillAttachmentImages } from '@/lib/attachmentImages'

export function Preview({ noteId, body }: { noteId: string; body: string }) {
  const notes = useNotes((s) => s.notes)
  const updateNote = useNotes((s) => s.updateNote)
  const openLink = useOpenLink()
  const index = useMemo(() => titleIndex(Object.values(notes)), [notes])
  const html = useMemo(
    () => renderMarkdown(body, { exists: (title) => index.has(normalizeTitle(title)) }),
    [body, index],
  )
  const root = useRef<HTMLDivElement>(null)
  // 連結卡片的縮圖存在本機附件裡，畫出來之後再補上
  useEffect(() => (root.current ? fillAttachmentImages(root.current) : undefined), [html])

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const wikilink = target.closest<HTMLElement>('a[data-title]')
    if (wikilink) {
      e.preventDefault()
      openLink(wikilink.dataset.title!)
      return
    }
    // 摺疊區塊只改畫面，不寫回原文（跟 Obsidian 一樣，收合狀態不算內容）
    const foldTitle = target.closest<HTMLElement>('.callout[data-fold] > .callout-title')
    if (foldTitle) {
      const box = foldTitle.parentElement!
      box.dataset.fold = box.dataset.fold === 'closed' ? 'open' : 'closed'
      return
    }
    if (target instanceof HTMLInputElement && target.dataset.task !== undefined) {
      updateNote(noteId, { body: toggleTask(body, Number(target.dataset.task)) })
      return
    }
    // 外部連結：網頁版開新分頁，不在原分頁導走；Android 殼會攔下來交給瀏覽器。
    // render.ts 已經把 href 限制在 http(s)、mailto 與 #，這裡看原始的 href（anchor.protocol 會把 # 算成本頁的 https:）
    const anchor = target.closest<HTMLAnchorElement>('a[href]')
    if (anchor && /^https?:/i.test(anchor.getAttribute('href')!)) {
      e.preventDefault()
      window.open(anchor.href, '_blank', 'noopener')
    }
  }

  if (!body.trim()) {
    return <p className="text-muted-foreground">（空白頁面）</p>
  }
  return <div ref={root} className="markdown" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
