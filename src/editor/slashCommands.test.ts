import { EditorState } from '@codemirror/state'
import { CompletionContext, autocompletion, completionStatus } from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { filterSlashCommands, slashCommands, slashEdit, slashSource, slashTrigger, uniqueTitle, type SlashCommand } from './slashCommands'

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
    // 分組名稱也能比對：清單這組有三項
    expect(labels(filterSlashCommands(commands, '清單'))).toEqual(['項目清單', '編號清單', '待辦'])
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
    // 一次插入成對的 [[ ]]，游標在中間；就算關掉自動完成也不會只剩半邊
    expect(slashEdit(byLabel('連結到頁面 [[ ]]'), '看 ', true)).toEqual({ insert: '[[]]', cursor: 2 })
  })
})

describe('slashSource', () => {
  it('行首的 / 跳選單，from 是 / 的位置', () => {
    const result = slashSource(contextAt('第一行\n/h'))!
    expect(result.from).toBe(4)
    const list = result.options.map((o) => o.label)
    // 開頭相同（h1、hr）的排在只有包含（checkbox）的前面
    expect(list.slice(0, 4)).toEqual(['標題 1', '標題 2', '標題 3', '分隔線'])
    expect(list.indexOf('待辦')).toBeGreaterThan(list.indexOf('分隔線'))
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

describe('更多指令', () => {
  it('中文輸入法的全形／也能叫出選單', () => {
    expect(slashSource(contextAt('／'))?.options.length).toBe(commands.length)
    expect(slashSource(contextAt('文字 ／分隔'))?.options.map((o) => o.label)).toEqual(['分隔線'])
  })

  it('打 --- 或 [[ 找得到對應的指令', () => {
    expect(labels(filterSlashCommands(commands, '---'))).toEqual(['分隔線'])
    expect(labels(filterSlashCommands(commands, '[['))).toEqual(['連結到頁面 [[ ]]'])
  })

  it('選單有 Notion 的主要區塊', () => {
    for (const label of ['子頁面', '摺疊區塊', '網址書籤', '上傳圖片', '圖片網址', '提示框・注意', '現在時間']) {
      expect(commands.some((c) => c.label === label)).toBe(true)
    }
  })

  it('摺疊區塊用 Obsidian 的 [!note]- 語法', () => {
    expect(slashEdit(byLabel('摺疊區塊'), '', true).insert).toBe('> [!note]- 標題\n> 內容')
  })

  it('子頁面的標題不跟現有的撞名', () => {
    const taken = new Set(['新頁面', '新頁面 2'])
    expect(uniqueTitle('新頁面', (t) => taken.has(t))).toBe('新頁面 3')
    expect(uniqueTitle('別的', (t) => taken.has(t))).toBe('別的')
  })
})

describe('slashTrigger', () => {
  function makeView() {
    return new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: '第一行\n',
        extensions: [markdown({ base: markdownLanguage }), autocompletion({ override: [slashSource] }), slashTrigger],
      }),
    })
  }

  it('輸入法或工具列插入的 / 不算打字，也要叫出選單', async () => {
    const view = makeView()
    // userEvent 是 input 而不是 input.type，CodeMirror 本身不會自動打開
    view.dispatch({ changes: { from: 4, insert: '/' }, selection: { anchor: 5 }, userEvent: 'input' })
    await vi.waitFor(() => expect(completionStatus(view.state)).not.toBeNull())
    view.destroy()
  })

  it('字中間的 / 不叫', async () => {
    const view = makeView()
    view.dispatch({ changes: { from: 3, insert: '/' }, selection: { anchor: 4 }, userEvent: 'input' })
    await new Promise((r) => setTimeout(r, 50))
    expect(completionStatus(view.state)).toBeNull()
    view.destroy()
  })
})

describe('顏色指令', () => {
  it('文字顏色與背景顏色各一組，插入一對標籤、游標在中間', () => {
    const red = byLabel('紅色文字')
    expect(red.look).toBe('text-red')
    expect(slashEdit(red, '', true)).toEqual({ insert: '<span style="color:#e5484d"></span>', cursor: '<span style="color:#e5484d">'.length })
    expect(byLabel('黃底').text.startsWith('<mark style="background:')).toBe(true)
    expect(slashEdit(byLabel('螢光標記'), '', true)).toEqual({ insert: '====', cursor: 2 })
  })

  it('打「顏色」或 color 找得到整組', () => {
    expect(filterSlashCommands(commands, '顏色').length).toBeGreaterThanOrEqual(9)
    expect(labels(filterSlashCommands(commands, 'red'))).toEqual(['紅色文字', '紅底'])
  })

  it('每一項都有外觀', () => {
    for (const c of commands) expect(c.look).toBeTruthy()
  })
})

