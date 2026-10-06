import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NumberInput, TextInput } from './inputs'

describe('TextInput', () => {
  it('Enter 才寫回', () => {
    const onCommit = vi.fn()
    render(<TextInput value="想讀" onCommit={onCommit} label="狀態" />)
    const input = screen.getByLabelText('狀態')
    input.focus()
    fireEvent.change(input, { target: { value: '讀完' } })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('讀完')
  })

  it('Escape 取消並還原', () => {
    const onCommit = vi.fn()
    render(<TextInput value="想讀" onCommit={onCommit} label="狀態" />)
    const input = screen.getByLabelText('狀態') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: '讀完' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('想讀')
  })

  it('點建議選項就寫回', async () => {
    const onCommit = vi.fn()
    render(<TextInput value="" suggestions={['想讀', '讀完']} onCommit={onCommit} label="狀態" />)
    const input = screen.getByLabelText('狀態')
    input.focus()
    // Autocomplete 是在 mousedown 時打開
    fireEvent.mouseDown(input)
    fireEvent.click(await screen.findByRole('option', { name: '讀完' }))
    expect(onCommit).toHaveBeenCalledWith('讀完')
  })
})

describe('NumberInput', () => {
  it('寫回數字，亂打的還原', () => {
    const onCommit = vi.fn()
    render(<NumberInput value={3} onCommit={onCommit} label="評分" />)
    const input = screen.getByLabelText('評分') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('3')
    fireEvent.change(input, { target: { value: '4' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith(4)
  })
})
