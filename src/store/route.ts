import { useSyncExternalStore } from 'react'

/**
 * 用網址的 hash 當路由：每次換頁都會進瀏覽紀錄，
 * Android 的返回鍵（MainActivity 呼叫 webView.goBack）就能回上一頁。
 */
export type Route =
  | { kind: 'home' }
  | { kind: 'page'; id: string }
  | { kind: 'graph' }
  | { kind: 'bookmarks' }
  | { kind: 'tag'; tag: string }
  | { kind: 'templates' }
  | { kind: 'settings' }

function decode(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    // 壞掉的 %E0 之類，當成沒有這段，回首頁
    return ''
  }
}

export function parseRoute(hash: string): Route {
  const [kind, arg] = hash.replace(/^#\/?/, '').split('/').map(decode)
  switch (kind) {
    case 'page':
      return arg ? { kind: 'page', id: arg } : { kind: 'home' }
    case 'tag':
      return arg ? { kind: 'tag', tag: arg } : { kind: 'home' }
    case 'graph':
    case 'bookmarks':
    case 'templates':
    case 'settings':
      return { kind }
    default:
      return { kind: 'home' }
  }
}

export function routeHash(route: Route): string {
  switch (route.kind) {
    case 'page':
      return `#/page/${encodeURIComponent(route.id)}`
    case 'tag':
      return `#/tag/${encodeURIComponent(route.tag)}`
    case 'home':
      return '#/'
    default:
      return `#/${route.kind}`
  }
}

export function navigate(route: Route) {
  const hash = routeHash(route)
  if (location.hash !== hash) location.hash = hash
}

/** 刪掉目前這頁時用：取代紀錄，按返回才不會回到已經不存在的頁面 */
export function replaceRoute(route: Route) {
  history.replaceState(null, '', routeHash(route))
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  return parseRoute(hash)
}
