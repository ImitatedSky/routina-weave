import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { filterSlashCommands, slashCommands, slashEdit, slashSource, type SlashCommand } from './slashCommands'

const commands = slashCommands(new Date(2026, 9, 6))
const byLabel = (label: string) => commands.find((c) => c.label === label)!
const labels = (list: SlashCommand[]) => list.map((c) => c.label)

function contextAt(doc: string, pos = doc.length) {
  const state = EditorState.create({ doc, extensions: markdown({ base: markdownLanguage }) })
  return new CompletionContext(state, pos, false)
}

describe('filterSlashCommands', () => {
  it('沒打字時列出全部', () => {
    expect(filterSlashCommands(commands, '')).toHaveLength(commands.length)
  })

  it('英文關鍵字不分大小寫', () => {
    expect(labels(filterSlashCommands(commands, 'H1'))).toEqual(['標題 1'])
    expect(labels(filterSlashCommands(commands, 'todo'))).toEqual(['待辦'])
    expect(labels(filterSlashCommands(commands, 'table'))).toEqual(['表格'])
  })

  it('中文名稱', () => {
    expect(labels(filterSlashCommands(commands, '標題'))).toEqual(['標題 1', '標題 2', '標題 3'])
    expect(labels(filterSlashCommands(commands, '清單'))).toEqual(['項目清單', '編號清單'])
  })

  it('沒有符合的就是空的', () => {
    expect(filterSlashCommands(commands, 'zzz')).toEqual([])
  })
})

describe('slashEdit', () => {
  it('空行直接插入行首記號', () => {
    expect(slashEdit(byLabel('標題 2'), '', true)).toEqual({ insert: '## ', cursor: 3 })
  })

  it('同一行前面有字時先換行', () => {
    expect(slashEdit(byLabel('待辦'), '買牛奶 ', true)).toEqual({ insert: '\n- [ ] ', cursor: 7 })
  })

  it('縮排保留，可以做巢狀清單', () => {
    expect(slashEdit(byLabel('項目清單'), '  ', false)).toEqual({ insert: '- ', cursor: 2 })
  })

  it('程式碼區塊的游標在中間那一行', () => {
    expect(slashEdit(byLabel('程式碼區塊'), '', true)).toEqual({ insert: '```\n\n```', cursor: 4 })
  })

  it('分隔線前面要空一行，不然會變成標題', () => {
    expect(slashEdit(byLabel('分隔線'), '', true).insert).toBe('---\n')
    expect(slashEdit(byLabel('分隔線'), '', false).insert).toBe('\n---\n')
    expect(slashEdit(byLabel('分隔線'), '文字 ', true).insert).toBe('\n\n---\n')
  })

  it('表格是兩欄範本，游標在第一個內容格', () => {
    const { insert, cursor } = slashEdit(byLabel('表格'), '', true)
    expect(insert).toBe('| 欄位 1 | 欄位 2 |\n| --- | --- |\n|  |  |')
    expect(insert.slice(0, cursor).endsWith('\n| ')).toBe(true)
  })

  it('行內的指令原地插入', () => {
    expect(slashEdit(byLabel('今天日期'), '今天是 ', true)).toEqual({ insert: '2026-10-06', cursor: 10 })
    expect(slashEdit(byLabel('連結到頁面'), '看 ', true)).toEqual({ insert: '[[', cursor: 2 })
  })
})

describe('slashSource', () => {
  it('行首的 / 跳選單，from 是 / 的位置', () => {
    const result = slashSource(contextAt('第一行\n/h'))!
    expect(result.from).toBe(4)
    // 開頭相同（h1、hr）的排在只有包含（checkbox）的前面
    expect(result.options.map((o) => o.label)).toEqual(['標題 1', '標題 2', '標題 3', '分隔線', '待辦'])
  })

  it('空白後的 / 也可以', () => {
    expect(slashSource(contextAt('文字 /todo'))?.options.map((o) => o.label)).toEqual(['待辦'])
  })

  it('網址或字中間的 / 不跳', () => {
    expect(slashSource(contextAt('https://a.com/'))).toBeNull()
    expect(slashSource(contextAt('a/b'))).toBeNull()
  })

  it('程式碼裡不跳', () => {
    expect(slashSource(contextAt('```\n/'))).toBeNull()
    expect(slashSource(contextAt('`a /` b', 4))).toBeNull()
  })
})
