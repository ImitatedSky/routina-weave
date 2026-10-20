import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachmentObjectUrl, imageTypeOfExtension, isImageType, safeAttachment, safeImageType } from './imageTypes'
import { getAttachment, putAttachment } from '@/storage/db'

describe('圖片類型白名單', () => {
  it('只認點陣圖', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']) {
      expect(isImageType(type)).toBe(true)
    }
    for (const type of ['image/svg+xml', 'text/html', 'application/xhtml+xml', '', 'constructor', 'toString']) {
      expect(isImageType(type)).toBe(false)
      expect(safeImageType(type)).toBe('application/octet-stream')
    }
  })

  it('副檔名 → MIME type', () => {
    expect(imageTypeOfExtension('JPG')).toBe('image/jpeg')
    expect(imageTypeOfExtension('jpeg')).toBe('image/jpeg')
    expect(imageTypeOfExtension('png')).toBe('image/png')
    expect(imageTypeOfExtension('svg')).toBe('application/octet-stream')
    expect(imageTypeOfExtension('html')).toBe('application/octet-stream')
  })
})

describe('attachmentObjectUrl', () => {
  const created: Blob[] = []
  const original = URL.createObjectURL
  afterEach(() => {
    URL.createObjectURL = original
    created.length = 0
  })
  const stub = () => {
    // jsdom 沒有 createObjectURL
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob)
      return 'blob:test'
    })
  }

  it('舊資料裡的 SVG 不建 blob: 網址', () => {
    stub()
    const svg = new Blob(['<svg onload="alert(1)"/>'], { type: 'image/svg+xml' })
    expect(attachmentObjectUrl({ id: 'a', type: 'image/svg+xml', blob: svg })).toBeUndefined()
    expect(created).toEqual([])
  })

  it('blob 的 type 跟附件對不上時，照附件的 type 重包', () => {
    stub()
    const blob = new Blob(['x'], { type: 'text/html' })
    expect(attachmentObjectUrl({ id: 'a', type: 'image/png', blob })).toBe('blob:test')
    expect(created[0].type).toBe('image/png')
  })
})

describe('safeAttachment', () => {
  it('不是點陣圖的換成 octet-stream，blob 的 type 也一起換', () => {
    const svg = safeAttachment({ id: 'a', type: 'image/svg+xml', blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }) })
    expect(svg.type).toBe('application/octet-stream')
    expect(svg.blob.type).toBe('application/octet-stream')
    // 附件說是 png、blob 卻是 html：照附件的 type 重包
    const mixed = safeAttachment({ id: 'b', type: 'image/png', blob: new Blob(['x'], { type: 'text/html' }) })
    expect(mixed.blob.type).toBe('image/png')
  })

  it('點陣圖照原樣', () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    expect(safeAttachment({ id: 'a', type: 'image/png', blob })).toEqual({ id: 'a', type: 'image/png', blob })
  })

  it('putAttachment 存進本機前也會檢查', async () => {
    await putAttachment({ id: 'svg1', type: 'image/svg+xml', blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }) })
    expect((await getAttachment('svg1'))?.type).toBe('application/octet-stream')
  })
})
