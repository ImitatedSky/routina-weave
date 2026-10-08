import type { Note } from './types'

/**
 * 範本就是一則 template: true 的筆記。套用時複製內文、屬性、標籤、圖示，
 * 內文與屬性的字串值裡可以用這些變數：
 *   {{title}}  新頁面的標題
 *   {{date}}   今天，YYYY-MM-DD
 *   {{time}}   現在，HH:mm
 */
export function fillTemplate(text: string, title: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  return text
    .replaceAll('{{title}}', title)
    .replaceAll('{{date}}', date)
    .replaceAll('{{time}}', time)
}

/** 套用範本後的欄位，交給 createNote 合併 */
export function fromTemplate(template: Note, title: string, now = new Date()): Partial<Note> {
  const props: Note['props'] = {}
  for (const [key, value] of Object.entries(template.props)) {
    props[key] = typeof value === 'string' ? fillTemplate(value, title, now) : value
  }
  // 欄位型別（例如空白的日期欄）記在 extra.propTypes，要跟著屬性一起帶過去
  const propTypes = template.extra?.propTypes
  return {
    body: fillTemplate(template.body, title, now),
    props,
    tags: [...template.tags],
    icon: template.icon,
    cover: template.cover,
    view: template.view,
    extra: propTypes ? { propTypes: structuredClone(propTypes) } : undefined,
  }
}
