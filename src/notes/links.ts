import type { Note } from './types'

/**
 * 筆記之間的 [[連結]]。連結寫標題（跟 Obsidian 一樣），可以加別名：[[標題|顯示文字]]。
 * 標題比對不分大小寫；同名時取最早建立的那則。
 */

export const WIKILINK = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]*))?\]\]/g

export interface WikiLink {
  target: string
  alias?: string
}

/** 內文裡所有的 [[連結]]，排除程式碼區塊 */
export function parseLinks(body: string): WikiLink[] {
  const withoutCode = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  const links: WikiLink[] = []
  for (const m of withoutCode.matchAll(WIKILINK)) {
    links.push({ target: m[1].trim(), alias: m[2]?.trim() || undefined })
  }
  return links
}

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

/** 標題 → 筆記 id。範本不參與連結 */
export function titleIndex(notes: Iterable<Note>): Map<string, string> {
  const sorted = [...notes].filter((n) => !n.template).sort((a, b) => a.created.localeCompare(b.created))
  const index = new Map<string, string>()
  for (const note of sorted) {
    const key = normalizeTitle(note.title)
    if (key && !index.has(key)) index.set(key, note.id)
  }
  return index
}

export interface LinkGraph {
  /** id → 它連出去的筆記 id */
  outgoing: Map<string, Set<string>>
  /** id → 連到它的筆記 id（反向連結） */
  incoming: Map<string, Set<string>>
  /** 連到不存在的標題（圖譜上畫成虛線節點）：id → 標題 */
  unresolved: Map<string, Set<string>>
}

export function buildLinkGraph(notes: Note[]): LinkGraph {
  const index = titleIndex(notes)
  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()
  const unresolved = new Map<string, Set<string>>()
  for (const note of notes) {
    if (note.template) continue
    for (const link of parseLinks(note.body)) {
      const targetId = index.get(normalizeTitle(link.target))
      if (!targetId) {
        if (!unresolved.has(note.id)) unresolved.set(note.id, new Set())
        unresolved.get(note.id)!.add(link.target)
        continue
      }
      if (targetId === note.id) continue
      if (!outgoing.has(note.id)) outgoing.set(note.id, new Set())
      outgoing.get(note.id)!.add(targetId)
      if (!incoming.has(targetId)) incoming.set(targetId, new Set())
      incoming.get(targetId)!.add(note.id)
    }
  }
  return { outgoing, incoming, unresolved }
}

/**
 * 改標題時把其他筆記裡指向舊標題的連結一起改掉，別名保留。
 * 回傳新的 body；沒有變動時回傳原字串（呼叫端用 === 判斷要不要存）。
 */
export function renameLinks(body: string, oldTitle: string, newTitle: string): string {
  const oldKey = normalizeTitle(oldTitle)
  if (!oldKey || oldKey === normalizeTitle(newTitle)) return body
  return body.replace(WIKILINK, (whole, target: string, alias: string | undefined) => {
    if (normalizeTitle(target) !== oldKey) return whole
    return alias !== undefined ? `[[${newTitle}|${alias}]]` : `[[${newTitle}]]`
  })
}
