import { describe, expect, it } from 'vitest'
import { safeHttpUrl } from './bookmarks'

describe('safeHttpUrl', () => {
  it('只放行 http(s)', () => {
    expect(safeHttpUrl('https://a.example/x')).toBe('https://a.example/x')
    expect(safeHttpUrl('http://a.example')).toBe('http://a.example/')
    for (const url of [
      'javascript:alert(document.domain)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'blob:https://a.example/x',
      'intent://x#Intent;end',
      'file:///etc/passwd',
      '//evil.example',
      'a.example',
      '',
      undefined,
    ]) {
      expect(safeHttpUrl(url)).toBeUndefined()
    }
  })
})
