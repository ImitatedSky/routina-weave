import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useNotes } from '@/store/notes'
import { seedNotes } from '@/notes/seed'
import { ChildPages } from '@/components/page/ChildPages'
import { PropertiesEditor } from '@/components/page/PropertiesEditor'
import type { Note } from '@/notes/types'

// 跟 PageView 一樣每次從 store 拿最新的 note
function Page({ id, part }: { id: string; part: 'children' | 'props' }) {
  const note = useNotes((s) => s.notes[id])
  return part === 'children' ? <ChildPages note={note} /> : <PropertiesEditor note={note} />
}

const byTitle = (title: string): Note => Object.values(useNotes.getState().notes).find((n) => n.title === title)!

beforeEach(() => {
  const notes = seedNotes()
  useNotes.setState({ loaded: true, notes: Object.fromEntries(notes.map((n) => [n.id, n])) })
})

describe('ChildPages 表格', () => {
  it('欄位是子頁面屬性的聯集，點標題排序並存進 extra', () => {
    const books = byTitle('書單')
    render(<Page id={books.id} part="children" />)
    expect(screen.getByText('子頁面（3）')).toBeInTheDocument()
    for (const name of ['標題', '作者', '狀態', '評分']) {
      expect(screen.getByRole('button', { name: `依「${name}」排序` })).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: '依「評分」排序' }))
    expect(byTitle('書單').extra).toEqual({ tableSort: { key: '評分', dir: 'asc' } })
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('人類大歷史')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '依「評分」排序' }))
    fireEvent.click(screen.getByRole('button', { name: '依「評分」排序' }))
    expect(byTitle('書單').extra).toBeUndefined()
  })

  it('新增篩選條件', () => {
    const books = byTitle('書單')
    render(<Page id={books.id} part="children" />)
    fireEvent.click(screen.getByRole('button', { name: '篩選' }))
    expect(byTitle('書單').extra?.tableFilters).toEqual([{ key: '作者', op: 'contains', value: '' }])
    fireEvent.change(screen.getByLabelText('條件值'), { target: { value: 'clear' } })
    expect(screen.getAllByRole('row')).toHaveLength(2)
  })

  it('點儲存格直接編輯', () => {
    const books = byTitle('書單')
    render(<Page id={books.id} part="children" />)
    fireEvent.click(screen.getByRole('button', { name: '編輯 人類大歷史 的評分' }))
    const input = screen.getByLabelText('人類大歷史 的評分')
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(byTitle('人類大歷史').props.評分).toBe(3)
  })

  it('切換視圖存到上層頁面', () => {
    const books = byTitle('書單')
    render(<Page id={books.id} part="children" />)
    fireEvent.click(screen.getByRole('radio', { name: '卡片' }))
    expect(byTitle('書單').view).toBe('gallery')
  })

  it('沒有子頁面時只有一行新增', () => {
    const welcome = byTitle('歡迎使用 Weave')
    render(<Page id={welcome.id} part="children" />)
    expect(screen.getByRole('button', { name: '新增子頁面' })).toBeInTheDocument()
    expect(screen.queryByText(/子頁面（/)).toBeNull()
  })
})

describe('PropertiesEditor', () => {
  it('評分畫星星，點了寫回', () => {
    const sapiens = byTitle('人類大歷史')
    render(<Page id={sapiens.id} part="props" />)
    fireEvent.click(screen.getByRole('button', { name: '4 顆星' }))
    expect(byTitle('人類大歷史').props.評分).toBe(4)
  })

  it('沒有屬性時只有新增按鈕', () => {
    const welcome = byTitle('歡迎使用 Weave')
    render(<Page id={welcome.id} part="props" />)
    expect(screen.getByRole('button', { name: '新增屬性' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '屬性' })).toBeNull()
  })
})
