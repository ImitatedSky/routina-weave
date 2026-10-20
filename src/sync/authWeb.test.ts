import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Auth = typeof import('./auth')

interface TokenConfig {
  callback: (response: object) => void
  error_callback?: (error: { type: string }) => void
}

/**
 * 假的 GIS。respond 決定按下連線後發生什麼事（呼叫 callback 或 error_callback），
 * 在 requestAccessToken 裡同步執行。
 */
function fakeGoogle(respond: (config: TokenConfig) => void = (c) => c.callback({ access_token: 'tok-1', expires_in: 3599 })) {
  let config: TokenConfig | undefined
  const requestAccessToken = vi.fn(() => fake.respond(config!))
  const oauth2 = {
    initTokenClient: vi.fn((c: TokenConfig) => {
      config = c
      return { requestAccessToken }
    }),
    hasGrantedAllScopes: vi.fn(() => true),
    revoke: vi.fn((_token: string, done?: (response?: { successful?: boolean; error?: string }) => void) =>
      done?.({ successful: true }),
    ),
  }
  const fake = { oauth2, requestAccessToken, respond }
  window.google = { accounts: { oauth2 } }
  return fake
}

async function loadAuth(clientId = 'test-client.apps.googleusercontent.com'): Promise<Auth> {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', clientId)
  vi.resetModules()
  return import('./auth')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  delete window.google
  vi.unstubAllEnvs()
  vi.useRealTimers()
  document.head.querySelectorAll('script').forEach((s) => s.remove())
})

describe('網頁版 Google 授權', () => {
  it('沒設定用戶端 ID 時不能登入', async () => {
    const auth = await loadAuth('')
    expect(auth.isSignInAvailable()).toBe(false)
    await expect(auth.signIn()).rejects.toMatchObject({ name: 'SignInError', code: 'unavailable' })
  })

  it('沒有 token 時非互動模式直接丟 NotSignedInError，不開視窗', async () => {
    const auth = await loadAuth()
    const google = fakeGoogle()
    await expect(auth.getAccessToken({ interactive: false })).rejects.toMatchObject({ name: 'NotSignedInError' })
    expect(google.requestAccessToken).not.toHaveBeenCalled()
  })

  it('互動模式走 requestAccessToken，之後記憶體裡的 token 直接給', async () => {
    const auth = await loadAuth()
    const google = fakeGoogle()
    const states: object[] = []
    auth.onAuthChange((s) => states.push(s))

    expect(auth.isSignInAvailable()).toBe(true)
    await auth.signIn()
    expect(google.oauth2.initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'https://www.googleapis.com/auth/drive.file' }),
    )
    expect(await auth.getAccessToken({ interactive: false })).toBe('tok-1')
    expect(await auth.getAccessToken({ interactive: true })).toBe('tok-1')
    expect(google.requestAccessToken).toHaveBeenCalledTimes(1)

    expect(states).toEqual([{ signedIn: true, wasConnected: true }])
    expect(localStorage.getItem('weave-google-connected')).toBe('1')
    // 只存「連線過」，不存 token
    expect(JSON.stringify({ ...localStorage })).not.toContain('tok-1')
  })

  it('快到期（剩不到 5 分鐘）就當成過期', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const auth = await loadAuth()
    fakeGoogle()
    await auth.signIn()

    vi.setSystemTime(Date.now() + 50 * 60 * 1000)
    expect(await auth.getAccessToken({ interactive: false })).toBe('tok-1')
    vi.setSystemTime(Date.now() + 5 * 60 * 1000)
    await expect(auth.getAccessToken({ interactive: false })).rejects.toMatchObject({ name: 'NotSignedInError' })
    // 重新整理後一樣：畫面要顯示「按一下重新連線」
    expect(auth.getAuthState()).toEqual({ signedIn: false, wasConnected: true })
  })

  it('forceRefresh 丟掉被拒絕的 token', async () => {
    const auth = await loadAuth()
    fakeGoogle()
    await auth.signIn()
    await expect(auth.getAccessToken({ interactive: false, forceRefresh: true })).rejects.toMatchObject({
      name: 'NotSignedInError',
    })
    await expect(auth.getAccessToken({ interactive: false })).rejects.toMatchObject({ name: 'NotSignedInError' })
  })

  it.each([
    ['關掉視窗', (c: TokenConfig) => c.error_callback?.({ type: 'popup_closed' }), 'cancelled'],
    ['視窗被擋', (c: TokenConfig) => c.error_callback?.({ type: 'popup_failed_to_open' }), 'popup-blocked'],
    ['拒絕授權', (c: TokenConfig) => c.callback({ error: 'access_denied' }), 'denied'],
    ['其他錯誤', (c: TokenConfig) => c.callback({ error: 'server_error' }), 'failed'],
  ])('%s', async (_name, respond, code) => {
    const auth = await loadAuth()
    fakeGoogle(respond)
    const error = await auth.signIn().catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'SignInError', code })
    expect(error).toBeInstanceOf((await import('./types')).NotSignedInError)
    expect(auth.getAuthState()).toEqual({ signedIn: false, wasConnected: false })
  })

  it('沒勾雲端硬碟權限算拒絕', async () => {
    const auth = await loadAuth()
    const google = fakeGoogle()
    google.oauth2.hasGrantedAllScopes.mockReturnValue(false)
    await expect(auth.signIn()).rejects.toMatchObject({ code: 'denied' })
    await expect(auth.getAccessToken({ interactive: false })).rejects.toMatchObject({ name: 'NotSignedInError' })
  })

  it('signOut 撤銷授權並清掉記憶體與旗標', async () => {
    const auth = await loadAuth()
    const google = fakeGoogle()
    await auth.signIn()
    await auth.signOut()

    expect(google.oauth2.revoke).toHaveBeenCalledWith('tok-1', expect.any(Function))
    expect(auth.getAuthState()).toEqual({ signedIn: false, wasConnected: false })
    expect(localStorage.getItem('weave-google-connected')).toBeNull()
    await expect(auth.getAccessToken({ interactive: false })).rejects.toMatchObject({ name: 'NotSignedInError' })
  })

  it('Google 回報撤銷失敗時要丟錯，本機一樣清掉', async () => {
    const auth = await loadAuth()
    const google = fakeGoogle()
    google.oauth2.revoke.mockImplementation((_token, done) => done?.({ successful: false, error: 'invalid_token' }))
    await auth.signIn()
    await expect(auth.signOut()).rejects.toMatchObject({ name: 'SignInError' })
    expect(auth.getAuthState()).toEqual({ signedIn: false, wasConnected: false })
  })

  it('token 已過期時不拿去撤銷，直接提醒使用者手動移除', async () => {
    vi.useFakeTimers()
    const auth = await loadAuth()
    const google = fakeGoogle()
    await auth.signIn()
    vi.advanceTimersByTime(2 * 3600 * 1000)
    await expect(auth.signOut()).rejects.toMatchObject({ name: 'SignInError' })
    expect(google.oauth2.revoke).not.toHaveBeenCalled()
  })

  it('需要時才載入 GIS 腳本', async () => {
    const auth = await loadAuth()
    const signingIn = auth.signIn()
    await Promise.resolve()
    const script = document.head.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]')
    expect(script).not.toBeNull()

    fakeGoogle()
    script!.onload!(new Event('load'))
    await signingIn
    expect(await auth.getAccessToken({ interactive: false })).toBe('tok-1')
  })

  it('GIS 腳本載不了時回報 unavailable，下次再試', async () => {
    const auth = await loadAuth()
    const signingIn = auth.signIn()
    await Promise.resolve()
    document.head.querySelector<HTMLScriptElement>('script')!.onerror!(new Event('error'))
    await expect(signingIn).rejects.toMatchObject({ code: 'unavailable' })
    expect(document.head.querySelector('script')).toBeNull()
  })
})
