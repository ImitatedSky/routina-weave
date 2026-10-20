import { describe, expect, it } from 'vitest'
import { showFrameGuard } from './frameGuard'

describe('showFrameGuard', () => {
  it('只留一個開新分頁的連結', () => {
    const root = document.createElement('div')
    root.innerHTML = '<button>刪除</button>'
    showFrameGuard(root)
    const link = root.querySelector('a')!
    expect(root.children).toHaveLength(1)
    expect(link.textContent).toBe('在新分頁開啟 Weave')
    expect(link.href).toBe(location.href)
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener')
  })
})
