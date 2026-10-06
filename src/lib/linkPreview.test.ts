import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLinkPreview, siteOf } from './linkPreview'

afterEach(() => {
  delete window.RoutinaWeaveLinks
  vi.useRealTimers()
})

/** 模擬原生 bridge：收到請求後非同步回呼 */
function mockBridge(result: object) {
  window.RoutinaWeaveLinks = {
    fetchPreview(id) {
      setTimeout(() => window.__weavePreviewResult?.(id, JSON.stringify(result)), 0)
    },
  }
}

describe('fetchLinkPreview', () => {
  it('沒有 bridge（網頁版）只回傳網域', async () => {
    expect(await fetchLinkPreview('https://www.example.com/a')).toEqual({ site: 'example.com' })
  })

  it('bridge 的結果整理後回傳，縮圖轉成 Blob', async () => {
    mockBridge({ ok: true, title: '  標題\n 換行 ', description: '說'.repeat(600), image: btoa('\x01\x02') })
    const preview = await fetchLinkPreview('https://example.com')
    expect(preview.title).toBe('標題 換行')
    expect(Array.from(preview.description!)).toHaveLength(500)
    expect(preview.site).toBe('example.com')
    expect(preview.image?.type).toBe('image/jpeg')
    expect(new Uint8Array(await preview.image!.arrayBuffer())).toEqual(new Uint8Array([1, 2]))
  })

  it('bridge 失敗時退回網域', async () => {
    mockBridge({ ok: false, error: 'blocked' })
    expect(await fetchLinkPreview('http://example.com')).toEqual({ site: 'example.com' })
  })

  it('20 秒沒回應就放棄', async () => {
    vi.useFakeTimers()
    window.RoutinaWeaveLinks = { fetchPreview() {} }
    const promise = fetchLinkPreview('https://example.com')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await promise).toEqual({ site: 'example.com' })
  })
})

it('siteOf 去掉 www.', () => {
  expect(siteOf('https://www.books.com.tw/x')).toBe('books.com.tw')
  expect(siteOf('不是網址')).toBeUndefined()
})
