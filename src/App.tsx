import { useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { useNotes } from '@/store/notes'
import { useRoute, type Route } from '@/store/route'
import { useUi } from '@/store/ui'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { SearchDialog } from '@/components/layout/SearchDialog'
import { BookmarkDialog } from '@/components/layout/BookmarkDialog'
import { PageView } from '@/components/page/PageView'
import { HomeView } from '@/components/views/HomeView'
import { TagView } from '@/components/views/TagView'
import { BookmarksView } from '@/components/views/BookmarksView'
import { SettingsView } from '@/components/views/SettingsView'
import { TemplatesView } from '@/components/views/TemplatesView'
import { GraphView } from '@/components/graph/GraphView'
import { notifyBridge, type BridgePort } from '@/lib/nativeBridge'
import { cn } from '@/lib/utils'
import { startAutoSync } from '@/sync/service'

export function App() {
  const loaded = useNotes((s) => s.loaded)
  const init = useNotes((s) => s.init)
  const route = useRoute()
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const setSidebarOpen = useUi((s) => s.setSidebarOpen)
  useThemeClass()

  useEffect(() => {
    void init()
  }, [init])

  // 筆記載入後才開始同步，不然會把空的本機狀態拿去比對
  useEffect(() => {
    if (loaded) startAutoSync()
  }, [loaded])

  // 換頁時捲回最上面
  useEffect(() => {
    document.getElementById('main')?.scrollTo(0, 0)
  }, [route.kind, route.kind === 'page' ? route.id : null]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return null

  return (
    <div className="flex h-full">
      {/* 桌機固定在左邊；手機是從左邊滑出的抽屜 */}
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/30 transition-opacity lg:hidden',
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r transition-transform lg:static lg:w-64 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar />
      </aside>

      <main id="main" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <TopBar route={route} />
        <RouteView route={route} />
      </main>

      <SearchDialog />
      <BookmarkDialog />
      <Toaster position="bottom-center" />
    </div>
  )
}

function RouteView({ route }: { route: Route }) {
  const note = useNotes((s) => (route.kind === 'page' ? s.notes[route.id] : undefined))
  switch (route.kind) {
    case 'page':
      return note ? <PageView key={note.id} note={note} /> : <NotFound />
    case 'graph':
      return <GraphView />
    case 'bookmarks':
      return <BookmarksView />
    case 'tag':
      return <TagView tag={route.tag} />
    case 'templates':
      return <TemplatesView />
    case 'settings':
      return <SettingsView />
    default:
      return <HomeView />
  }
}

function NotFound() {
  return <p className="p-8 text-muted-foreground">這一頁不存在，可能已經被刪除。</p>
}

/** html 上的 .dark 跟著設定與系統深淺色走 */
function useThemeClass() {
  const theme = useUi((s) => s.theme)
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      // Android 殼：狀態列與導覽列跟著換色（手動選了跟系統相反的深淺色時才看得出差別）
      const systemBars = window.RoutinaWeaveSystemBars
      if (systemBars) notifyBridge(systemBars, { dark })
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

declare global {
  interface Window {
    RoutinaWeaveSystemBars?: BridgePort
  }
}
