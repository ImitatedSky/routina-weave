import type { Note } from './types'

/** 第一次開啟時放幾則示範筆記，每個功能都看得到一個例子 */
export function seedNotes(): Note[] {
  const now = Date.now()
  let tick = 0
  // 每則差一秒，標題同名時「最早建立」的規則才有意義
  const at = () => new Date(now + tick++ * 1000).toISOString()

  const make = (fields: Partial<Note> & Pick<Note, 'title'>): Note => {
    const time = at()
    return {
      id: crypto.randomUUID(),
      body: '',
      parent: null,
      order: tick,
      tags: [],
      props: {},
      created: time,
      updated: time,
      ...fields,
    }
  }

  const welcome = make({
    title: '歡迎使用 Weave',
    cover: 'preset:ocean',
    icon: '🧶',
    pinned: true,
    body: `Weave 把筆記織成一張網。每則筆記都是一個 Markdown 檔，可以整包匯出。

## 試試看

- 打 \`[[\` 連到另一則筆記，例如 [[書單]] 或 [[網址收藏]]
- 打 \`/\` 叫出插入選單
- 在內文寫 #標籤，左側「標籤」會自動整理
- 右上角的 **圖譜** 看筆記之間怎麼連起來

> [!tip] 子頁面
> 每一頁底下都可以再放子頁面，像資料夾一樣。往下捲到「子頁面」就能新增。

- [x] 讀完這頁
- [ ] 建立第一則自己的筆記
`,
  })

  const bookTemplate = make({
    title: '讀書筆記',
    icon: '📕',
    template: true,
    props: { 作者: '', 狀態: '想讀', 評分: 0 },
    body: `開始讀：{{date}}

## 摘要

## 喜歡的句子

>

## 想法

連到相關的筆記：[[ ]]
`,
  })

  const books = make({
    title: '書單',
    cover: 'preset:sand',
    icon: '📚',
    view: 'table',
    childTemplate: bookTemplate.id,
    body: `底下每一本書都是一個子頁面，屬性（作者、狀態、評分）會變成表格的欄位。

點下方子頁面旁的「清單／表格／卡片」切換顯示方式，表格可以點欄位排序、篩選。新增的書會自動套用「讀書筆記」範本（左側「範本」可以修改）。
`,
  })

  const atomic = make({
    title: '原子習慣',
    cover: 'preset:peach',
    icon: '⚛️',
    parent: books.id,
    props: { 作者: 'James Clear', 狀態: '讀完', 評分: 5 },
    tags: ['習慣'],
    body: `## 摘要

習慣是複利。每天進步 1%，一年後是 37 倍。

## 想法

跟 [[深度工作]] 一起看：先用小習慣把專注時段固定下來。 #自我成長
`,
  })

  const deepWork = make({
    title: '深度工作',
    cover: 'preset:night',
    icon: '🎯',
    parent: books.id,
    props: { 作者: 'Cal Newport', 狀態: '閱讀中', 評分: 4 },
    body: `## 摘要

能長時間專注在困難任務上，是越來越稀有、也越來越值錢的能力。

連回 [[原子習慣]]。 #自我成長 #工作
`,
  })

  const sapiens = make({
    title: '人類大歷史',
    cover: 'preset:forest',
    icon: '🦴',
    parent: books.id,
    props: { 作者: 'Yuval Noah Harari', 狀態: '想讀', 評分: 0 },
    body: '',
  })

  const bookmarks = make({
    title: '網址收藏',
    cover: 'preset:dusk',
    icon: '🔖',
    view: 'gallery',
    body: `貼上網址就會變成一則筆記，自動抓標題與縮圖。底下切成卡片可以看縮圖，切成清單比較精簡。

左側「網址」會列出所有網址筆記，不管放在哪一頁底下。
`,
  })

  const link1 = make({
    title: 'Obsidian — Sharpen your thinking',
    parent: bookmarks.id,
    url: 'https://obsidian.md/',
    site: 'obsidian.md',
    description: 'The free and flexible app for your private thoughts.',
    body: '參考它的 [[圖譜]] 與反向連結做法。',
  })

  const link2 = make({
    title: 'CodeMirror',
    parent: bookmarks.id,
    url: 'https://codemirror.net/',
    site: 'codemirror.net',
    description: 'In-browser code editor.',
    body: 'Weave 的編輯器就是用它做的。 #工具',
  })

  const journalTemplate = make({
    title: '日記',
    icon: '📓',
    template: true,
    body: `# {{date}}

## 今天做了什麼

## 明天要做

- [ ]
`,
  })

  return [welcome, bookTemplate, books, atomic, deepWork, sapiens, bookmarks, link1, link2, journalTemplate]
}
