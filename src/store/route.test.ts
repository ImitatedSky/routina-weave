import { describe, expect, it } from 'vitest'
import { parseRoute } from './route'

describe('parseRoute', () => {
  it('解析頁面與標籤', () => {
    expect(parseRoute('#/page/abc')).toEqual({ kind: 'page', id: 'abc' })
    expect(parseRoute('#/tag/%E5%B7%A5%E4%BD%9C')).toEqual({ kind: 'tag', tag: '工作' })
  })

  it('壞掉的編碼不會丟錯，回首頁', () => {
    expect(parseRoute('#/page/%E0')).toEqual({ kind: 'home' })
    expect(parseRoute('#/tag/%')).toEqual({ kind: 'home' })
  })
})
