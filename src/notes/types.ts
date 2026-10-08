/** 屬性值：表格視圖可以排序、篩選的就這三種 */
export type PropValue = string | number | boolean

/** 子頁面的顯示方式 */
export type ChildView = 'list' | 'table' | 'gallery'

/**
 * 一則筆記。每則筆記在磁碟（將來是 Drive）上就是一個 .md 檔：
 * 除了 body 之外的欄位都寫在 frontmatter，見 markdown.ts。
 */
export interface Note {
  id: string
  title: string
  /** frontmatter 之後的 Markdown 內文 */
  body: string
  /** 上層頁面的 id；null 是最上層 */
  parent: string | null
  /** 同一層內的排序，小的在前 */
  order: number
  icon?: string
  /** 頁面最上方的封面：附件 id（圖片），或內建的 preset:xxx（漸層、純色），見 covers.ts */
  cover?: string
  tags: string[]
  /** 網址筆記才有 */
  url?: string
  site?: string
  description?: string
  /** 縮圖的附件 id（存在 attachments） */
  image?: string
  /** 使用者自訂屬性（精簡資料庫的欄位） */
  props: Record<string, PropValue>
  /** 這則筆記是範本 */
  template?: boolean
  /** 在這一頁底下新增子頁面時預設套用的範本 id */
  childTemplate?: string
  /** 子頁面的顯示方式，沒設就是清單 */
  view?: ChildView
  pinned?: boolean
  created: string
  updated: string
  /** 讀進來時不認得的 frontmatter 欄位，寫回去時原樣保留 */
  extra?: Record<string, unknown>
}
