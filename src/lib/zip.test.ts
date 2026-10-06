import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Note } from '@/notes/types'
import { toMarkdown } from '@/notes/markdown'
import {
  buildExportZip,
  exportFilename,
  exportPaths,
  notesFromFiles,
  planImport,
  prepareImport,
  readImportSources,
  safeFilename,
  stripCommonRoot,
  titleFromFilename,
} from './zip'

let seq = 0
function note(fields: Partial<Note> & Pick<Note, 'title'>): Note {
  seq++
  return {
    id: `n${seq}`,
    body: '',
    parent: null,
    order: seq,
    tags: [],
    props: {},
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...fields,
  }
}

describe('safeFilename', () => {
  it('清掉不能用的字元與控制字元', () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
    expect(safeFilename('tab\there\u0000\u007f')).toBe('tabhere')
  })

  it('去掉結尾的點與空白', () => {
    expect(safeFilename('  結尾. . ')).toBe('結尾')
    expect(safeFilename('...')).toBe('未命名')
  })

  it('最多 100 字，emoji 算一個字', () => {
    expect(Array.from(safeFilename('字'.repeat(150)))).toHaveLength(100)
    expect(safeFilename('🧶'.repeat(120))).toBe('🧶'.repeat(100))
  })

  it('空的與 Windows 保留名稱', () => {
    expect(safeFilename('')).toBe('未命名')
    expect(safeFilename('CON')).toBe('CON_')
  })
})

describe('titleFromFilename', () => {
  it('去掉 Notion 的 hash', () => {
    expect(titleFromFilename('書單 0123456789abcdef0123456789abcdef')).toBe('書單')
    expect(titleFromFilename('書單')).toBe('書單')
  })
})

it('exportFilename 用本地日期', () => {
  expect(exportFilename(new Date(2026, 9, 6, 23, 59))).toBe('weave-export-20261006.zip')
})

describe('exportPaths', () => {
  it('子頁面放在與上層同名的資料夾，範本放 _templates', () => {
    const books = note({ title: '書單' })
    const atomic = note({ title: '原子習慣', parent: books.id })
    const deep = note({ title: '第一章', parent: atomic.id })
    const tpl = note({ title: '讀書筆記', template: true })
    const paths = exportPaths([books, atomic, deep, tpl])
    expect(paths.get(books.id)).toBe('書單')
    expect(paths.get(atomic.id)).toBe('書單/原子習慣')
    expect(paths.get(deep.id)).toBe('書單/原子習慣/第一章')
    expect(paths.get(tpl.id)).toBe('_templates/讀書筆記')
  })

  it('同資料夾同名的依 order 加 (2)、(3)，不分大小寫', () => {
    const a = note({ title: 'Note', order: 0 })
    const b = note({ title: 'note', order: 1 })
    const c = note({ title: 'Note', order: 2 })
    const child = note({ title: '子', parent: b.id })
    const paths = exportPaths([c, b, a, child])
    expect(paths.get(a.id)).toBe('Note')
    expect(paths.get(b.id)).toBe('note (2)')
    expect(paths.get(c.id)).toBe('Note (3)')
    expect(paths.get(child.id)).toBe('note (2)/子')
  })

  it('不會和 _templates、_attachments 撞名', () => {
    const a = note({ title: '_attachments' })
    expect(exportPaths([a]).get(a.id)).toBe('_attachments (2)')
  })

  it('上層不存在或互相指的筆記也會匯出', () => {
    const lost = note({ title: '孤兒', parent: 'missing' })
    const x = note({ title: 'X', id: 'x', parent: 'y' })
    const y = note({ title: 'Y', id: 'y', parent: 'x' })
    const paths = exportPaths([lost, x, y])
    expect(paths.get(lost.id)).toBe('孤兒')
    expect(paths.size).toBe(3)
  })
})

describe('stripCommonRoot', () => {
  it('整包包在同一個資料夾時拿掉', () => {
    const entries = [{ segments: ['Vault', 'a.md'] }, { segments: ['Vault', 'b', 'c.md'] }]
    expect(stripCommonRoot(entries).map((e) => e.segments.join('/'))).toEqual(['a.md', 'b/c.md'])
  })

  it('最上層有檔案就不動', () => {
    const entries = [{ segments: ['書單.md'] }, { segments: ['書單', 'a.md'] }]
    expect(stripCommonRoot(entries)).toEqual(entries)
  })
})

describe('notesFromFiles', () => {
  it('沒有 id 的依資料夾推出上層，X/ 的上層是 X.md', () => {
    const { notes } = notesFromFiles([
      { path: '書單/原子習慣.md', text: '好書' },
      { path: '書單.md', text: '# 書單' },
    ])
    const books = notes.find((n) => n.title === '書單')!
    const atomic = notes.find((n) => n.title === '原子習慣')!
    expect(books.parent).toBeNull()
    expect(atomic.parent).toBe(books.id)
    expect(atomic.body).toBe('好書')
    expect(notes).toHaveLength(2)
  })

  it('沒有對應 .md 的資料夾自動建空頁面', () => {
    const { notes } = notesFromFiles([{ path: '專案/2026/計畫 0123456789abcdef0123456789abcdef.md', text: 'x' }])
    const plan = notes.find((n) => n.title === '計畫')!
    const year = notes.find((n) => n.title === '2026')!
    const project = notes.find((n) => n.title === '專案')!
    expect(plan.parent).toBe(year.id)
    expect(year.parent).toBe(project.id)
    expect(project.parent).toBeNull()
    expect(project.body).toBe('')
  })

  it('frontmatter 有 id 的照原本的 id 與 parent，子檔案接得上它', () => {
    const parent = note({ title: '書單', id: 'books' })
    const { notes } = notesFromFiles([
      { path: '書單.md', text: toMarkdown(parent) },
      { path: '書單/新書.md', text: '沒有 frontmatter' },
    ])
    expect(notes.find((n) => n.title === '新書')!.parent).toBe('books')
    expect(notes.find((n) => n.id === 'books')!.title).toBe('書單')
  })

  it('_templates/ 底下的是範本，_templates 本身不是頁面', () => {
    const { notes } = notesFromFiles([{ path: '_templates/週記.md', text: '{{date}}' }])
    expect(notes).toHaveLength(1)
    expect(notes[0].template).toBe(true)
    expect(notes[0].parent).toBeNull()
  })

  it('frontmatter 壞掉的記為失敗', () => {
    const { notes, failed } = notesFromFiles([{ path: 'bad.md', text: '---\nid: [\n---\n' }])
    expect(notes).toHaveLength(0)
    expect(failed).toEqual(['bad.md'])
  })
})

describe('planImport', () => {
  it('新增、較新的更新、不比較新的略過', () => {
    const existing = {
      old: note({ title: '舊', id: 'old', updated: '2026-01-01T00:00:00.000Z' }),
      same: note({ title: '一樣', id: 'same', updated: '2026-02-01T00:00:00.000Z' }),
    }
    const plan = planImport(
      [
        note({ title: '新', id: 'new' }),
        note({ title: '舊改', id: 'old', updated: '2026-03-01T00:00:00.000Z' }),
        note({ title: '一樣', id: 'same', updated: '2026-02-01T00:00:00.000Z' }),
      ],
      existing,
    )
    expect(plan).toMatchObject({ added: 1, updated: 1, skipped: 1 })
    expect(plan.notes.map((n) => n.id).sort()).toEqual(['new', 'old'])
  })

  it('上層找不到的放到最上層', () => {
    const plan = planImport([note({ title: 'a', parent: 'nowhere' })], {})
    expect(plan.notes[0].parent).toBeNull()
  })

  it('同一包裡重複的 id 取較新的', () => {
    const plan = planImport(
      [
        note({ title: '舊', id: 'dup', updated: '2026-01-01T00:00:00.000Z' }),
        note({ title: '新', id: 'dup', updated: '2026-05-01T00:00:00.000Z' }),
      ],
      {},
    )
    expect(plan).toMatchObject({ added: 1, skipped: 1 })
    expect(plan.notes[0].title).toBe('新')
  })
})

describe('zip', () => {
  it('匯出再匯入得到一樣的筆記與附件', async () => {
    const books = note({ title: '書單', id: 'books', image: 'img1', tags: ['讀書'] })
    const atomic = note({ title: '原子習慣', id: 'atomic', parent: 'books', body: '好書 [[書單]]' })
    const tpl = note({ title: '讀書筆記', id: 'tpl', template: true })
    const image = { id: 'img1', type: 'image/jpeg', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) }

    const data = await buildExportZip([books, atomic, tpl], [image])
    expect(Object.keys(unzipSync(data)).sort()).toEqual([
      '_attachments/img1.jpg',
      '_templates/讀書筆記.md',
      '書單.md',
      '書單/原子習慣.md',
    ])

    const { plan, attachments, failed } = prepareImport([{ name: 'weave.zip', bytes: data }], {})
    expect(failed).toEqual([])
    expect(plan.added).toBe(3)
    const byId = Object.fromEntries(plan.notes.map((n) => [n.id, n]))
    // toEqual 把值是 undefined 的欄位當成沒有
    expect(byId.atomic).toEqual(atomic)
    expect(byId.books.image).toBe('img1')
    expect(byId.tpl.template).toBe(true)
    expect(attachments).toHaveLength(1)
    expect(attachments[0]).toMatchObject({ id: 'img1', type: 'image/jpeg' })
    expect(new Uint8Array(await attachments[0].blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('忽略 .. 路徑、隱藏檔與其他檔案', () => {
    const data = zipSync({
      '../evil.md': strToU8('x'),
      'a/../../evil2.md': strToU8('x'),
      '.obsidian/workspace.md': strToU8('x'),
      '__MACOSX/._a.md': strToU8('x'),
      'photo.png': strToU8('x'),
      'ok.md': strToU8('ok'),
    })
    const { files } = readImportSources([{ name: 'x.zip', bytes: data }])
    expect(files.map((f) => f.path)).toEqual(['ok.md'])
  })

  it('檔案太多時拒絕', () => {
    const many: Record<string, Uint8Array> = {}
    for (let i = 0; i < 5001; i++) many[`${i}.md`] = new Uint8Array()
    expect(() => readImportSources([{ name: 'x.zip', bytes: zipSync(many) }])).toThrow(/zip 太大/)
  })

  it('也接受單一 .md 檔', () => {
    const { files } = readImportSources([{ name: '筆記.md', bytes: strToU8('hello') }])
    expect(files).toEqual([{ path: '筆記.md', text: 'hello' }])
  })
})
