import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeBridgePort } from './fakeBridgePort'
import { saveFile } from './saveFile'

afterEach(() => {
  delete window.RoutinaWeaveFiles
  vi.restoreAllMocks()
})

describe('saveFile 走 Android bridge', () => {
  it('把內容轉成 base64 連同檔名送出，回傳 saved', async () => {
    const port = fakeBridgePort(() => ({ status: 'saved', message: '' }))
    window.RoutinaWeaveFiles = port
    const blob = new Blob(['hi'], { type: 'application/zip' })
    expect(await saveFile(blob, 'notes.zip')).toBe('saved')
    expect(port.sent).toEqual([{ id: expect.any(String), base64: btoa('hi'), filename: 'notes.zip', mimeType: 'application/zip' }])
  })

  it('使用者取消時回傳 cancelled', async () => {
    window.RoutinaWeaveFiles = fakeBridgePort(() => ({ status: 'cancelled', message: '' }))
    expect(await saveFile(new Blob(['x']), 'a.md')).toBe('cancelled')
  })

  it('錯誤代碼換成文字', async () => {
    window.RoutinaWeaveFiles = fakeBridgePort(() => ({ status: 'error', message: 'write:disk full' }))
    await expect(saveFile(new Blob(['x']), 'a.md')).rejects.toThrow('存檔失敗：無法寫入檔案（disk full）')
  })
})

it('Android 殼沒有 bridge 時直接報錯，不假裝存好了', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14; wv) RoutinaWeaveAndroid')
  await expect(saveFile(new Blob(['x']), 'a.md')).rejects.toThrow('Android System WebView')
})
