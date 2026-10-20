import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBridgePort } from '@/lib/fakeBridgePort'

type Auth = typeof import('./auth')

/** 模擬原生 bridge：收到請求後非同步回覆 reply 給的結果 */
function mockBridge(reply: (call: Record<string, unknown>) => object) {
  const port = fakeBridgePort(reply)
  window.RoutinaWeaveAuth = port
  return port
}

async function loadAuth(): Promise<Auth> {
  // Android 不需要網頁的用戶端 ID
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
  vi.resetModules()
  return import('./auth')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  delete window.RoutinaWeaveAuth
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Android 版 Google 授權', () => {
  it('有 bridge 就能登入，不需要網頁的用戶端 ID', async () => {
    const auth = await loadAuth()
    mockBridge(() => ({ ok: true, token: 'native-tok' }))
    expect(auth.isSignInAvailable()).toBe(true)
  })

  it('把 interactive 與 forceRefresh 傳給原生端並回傳 token', async () => {
    const auth = await loadAuth()
    const bridge = mockBridge(() => ({ ok: true, token: 'native-tok' }))

    await auth.signIn()
    expect(bridge.sent.at(-1)).toEqual({ id: expect.any(String), method: 'getToken', interactive: true, forceRefresh: false })
    expect(await auth.getAccessToken({ interactive: false, forceRefresh: true })).toBe('native-tok')
    expect(bridge.sent.at(-1)).toEqual({ id: expect.any(String), method: 'getToken', interactive: false, forceRefresh: true })
    expect(auth.getAuthState()).toEqual({ signedIn: true, wasConnected: true })
  })

  it('同時好幾個請求，各自對到自己的結果', async () => {
    const auth = await loadAuth()
    let n = 0
    mockBridge(() => ({ ok: true, token: `tok-${++n}` }))
    const tokens = await Promise.all([
      auth.getAccessToken({ interactive: false }),
      auth.getAccessToken({ interactive: false }),
    ])
    expect(tokens).toEqual(['tok-1', 'tok-2'])
  })

  it('還沒授權過（needs-interaction）是 NotSignedInError，不是登入失敗', async () => {
    const auth = await loadAuth()
    mockBridge(() => ({ ok: false, error: 'needs-interaction' }))
    const error = await auth.getAccessToken({ interactive: false }).catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'NotSignedInError' })
    expect(auth.getAuthState().signedIn).toBe(false)
  })

  it.each([
    ['cancelled', 'cancelled'],
    ['denied', 'denied'],
    ['config', 'config'],
    ['network', 'network'],
    ['unavailable', 'unavailable'],
    ['failed:13', 'failed'],
    ['怪東西', 'failed'],
  ])('錯誤代碼 %s → %s', async (raw, code) => {
    const auth = await loadAuth()
    mockBridge(() => ({ ok: false, error: raw }))
    await expect(auth.signIn()).rejects.toMatchObject({ name: 'SignInError', code })
  })

  it('原生端兩分鐘沒回應就放棄', async () => {
    vi.useFakeTimers()
    const auth = await loadAuth()
    window.RoutinaWeaveAuth = fakeBridgePort()
    const signingIn = auth.signIn().catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    expect(await signingIn).toMatchObject({ name: 'SignInError', code: 'failed' })
  })

  it('signOut 呼叫原生端並清掉旗標', async () => {
    const auth = await loadAuth()
    const bridge = mockBridge((call) => (call.method === 'signOut' ? { ok: true } : { ok: true, token: 't' }))
    await auth.signIn()
    expect(localStorage.getItem('weave-google-connected')).toBe('1')

    await auth.signOut()
    expect(bridge.sent.filter((call) => call.method === 'signOut')).toHaveLength(1)
    expect(auth.getAuthState()).toEqual({ signedIn: false, wasConnected: false })
    expect(localStorage.getItem('weave-google-connected')).toBeNull()
  })

  it('撤銷失敗也清掉本機狀態，再把錯誤丟出去', async () => {
    const auth = await loadAuth()
    mockBridge((call) => (call.method === 'signOut' ? { ok: false, error: 'network' } : { ok: true, token: 't' }))
    await auth.signIn()
    await expect(auth.signOut()).rejects.toMatchObject({ code: 'network' })
    expect(auth.getAuthState()).toEqual({ signedIn: false, wasConnected: false })
  })

  it('別的 id 的回覆或不是 JSON 的訊息不會被當成結果', async () => {
    vi.useFakeTimers()
    const auth = await loadAuth()
    const listeners: ((event: MessageEvent) => void)[] = []
    window.RoutinaWeaveAuth = {
      postMessage() {
        for (const listener of listeners) {
          listener(new MessageEvent('message', { data: '不是 JSON' }))
          listener(new MessageEvent('message', { data: JSON.stringify({ id: 'someone-else', ok: true, token: 'x' }) }))
        }
      },
      addEventListener(_type, listener) {
        listeners.push(listener)
      },
    }
    const signingIn = auth.signIn().catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    expect(await signingIn).toMatchObject({ name: 'SignInError', code: 'failed' })
  })
})

describe('Android 殼沒有授權 bridge（WebView 太舊）', () => {
  const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; wv) Chrome/130.0.0.0 Mobile Safari/537.36 RoutinaWeaveAndroid'

  async function loadInShell(): Promise<Auth> {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID_UA)
    // 就算建置時帶了網頁的用戶端 ID，WebView 裡的 GIS 登入也會被 Google 擋掉
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client.apps.googleusercontent.com')
    vi.resetModules()
    return import('./auth')
  }

  it('不能連線，不會退回網頁登入', async () => {
    const auth = await loadInShell()
    expect(auth.isSignInAvailable()).toBe(false)
    await expect(auth.signIn()).rejects.toMatchObject({ name: 'SignInError', code: 'unavailable' })
  })

  it('沒有 Android 標記的瀏覽器照常走網頁登入', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client.apps.googleusercontent.com')
    vi.resetModules()
    const auth = await import('./auth')
    expect(auth.isSignInAvailable()).toBe(true)
  })
})
