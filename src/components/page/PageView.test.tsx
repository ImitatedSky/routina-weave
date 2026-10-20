import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { useNotes } from '@/store/notes'
import { useUi } from '@/store/ui'
import { seedNotes } from '@/notes/seed'
import { PageView } from './PageView'

// 跟 App 一樣每次從 store 拿最新的 note
function Page({ id }: { id: string }) {
  const note = useNotes((s) => s.notes[id])
  return <PageView note={note} />
}

let id: string
const body = () => useNotes.getState().notes[id].body
const title = () => useNotes.getState().notes[id].title
// 模擬雲端同步把別台裝置的新版寫進 store
const remote = (patch: { body?: string; title?: string }) =>
  act(() => {
    const note = useNotes.getState().notes[id]
    useNotes.setState({ notes: { ...useNotes.getState().notes, [id]: { ...note, ...patch } } })
  })
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)))

function editor() {
  return EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!
}
function typeAtEnd(text: string) {
  const view = editor()
  const end = view.state.doc.length
  act(() => view.dispatch({ changes: { from: end, insert: text }, selection: { anchor: end + text.length }, userEvent: 'input.type' }))
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const notes = seedNotes()
  useNotes.setState({ loaded: true, notes: Object.fromEntries(notes.map((n) => [n.id, n])) })
  useUi.setState({ mode: 'edit' })
  id = notes.find((n) => !n.template && !n.url)!.id
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PageView 遇到雲端同步改了目前這頁', () => {
  it('沒在打字時編輯器換成新版，接著打的字接在新版後面存回去', async () => {
    render(<Page id={id} />)
    remote({ body: '別台裝置改的' })
    expect(editor().state.doc.toString()).toBe('別台裝置改的')

    typeAtEnd('！')
    await waitFor(() => expect(body()).toBe('別台裝置改的！'))
  })

  it('還有沒存的字時保留本機打的字當正本，別台的版本另存成衝突副本', async () => {
    render(<Page id={id} />)
    const original = body()
    const originalTitle = title()
    const parent = useNotes.getState().notes[id].parent
    typeAtEnd('本機')
    remote({ body: '別台裝置改的' })
    expect(editor().state.doc.toString()).toBe(original + '本機')
    await waitFor(() => expect(body()).toBe(original + '本機'))

    const copies = Object.values(useNotes.getState().notes).filter((n) => n.title.startsWith(`${originalTitle}（衝突副本 `))
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({ body: '別台裝置改的', parent })
    expect(copies[0].id).not.toBe(id)
  })

  it('一般打字存回時不會多出衝突副本', async () => {
    render(<Page id={id} />)
    const count = Object.keys(useNotes.getState().notes).length
    typeAtEnd('a')
    await waitFor(() => expect(body()).toMatch(/a$/))
    typeAtEnd('b')
    await waitFor(() => expect(body()).toMatch(/ab$/))
    expect(Object.keys(useNotes.getState().notes)).toHaveLength(count)
  })

  it('打了又改回原樣時沒有要存的，不會把新版蓋回舊的', async () => {
    render(<Page id={id} />)
    const original = body()
    typeAtEnd('x')
    const view = editor()
    act(() => view.dispatch({ changes: { from: original.length, to: original.length + 1 }, userEvent: 'delete.backward' }))
    remote({ body: '別台裝置改的' })
    expect(editor().state.doc.toString()).toBe('別台裝置改的')
    await wait(400)
    expect(body()).toBe('別台裝置改的')
  })

  it('只是點進標題沒打字，離開時不會把新標題改回舊的', () => {
    render(<Page id={id} />)
    const input = screen.getByLabelText('標題')
    fireEvent.focus(input)
    remote({ title: '別台裝置改的標題' })
    expect(input).toHaveValue('別台裝置改的標題')
    fireEvent.blur(input)
    expect(title()).toBe('別台裝置改的標題')
  })

  it('標題打了字照常寫回', () => {
    render(<Page id={id} />)
    const input = screen.getByLabelText('標題')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '新標題' } })
    fireEvent.blur(input)
    expect(title()).toBe('新標題')
  })
})
