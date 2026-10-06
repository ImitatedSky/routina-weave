import { create } from 'zustand'

export type Theme = 'system' | 'light' | 'dark'
export type EditMode = 'edit' | 'preview'

interface UiState {
  sidebarOpen: boolean
  searchOpen: boolean
  bookmarkOpen: boolean
  /** 編輯或預覽，所有頁面共用一個設定 */
  mode: EditMode
  theme: Theme
  setSidebarOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  /** 新增網址的對話框；parent 是新筆記要放在哪一頁底下 */
  bookmarkParent: string | null
  openBookmark: (parent: string | null) => void
  closeBookmark: () => void
  setMode: (mode: EditMode) => void
  setTheme: (theme: Theme) => void
}

// localStorage 只放介面偏好；私密瀏覽或被封鎖時照常運作，只是不記住
function read<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(key) as T | null
    return value && allowed.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 不記住而已
  }
}

export const useUi = create<UiState>((set) => ({
  sidebarOpen: false,
  searchOpen: false,
  bookmarkOpen: false,
  bookmarkParent: null,
  mode: read<EditMode>('weave-mode', 'edit', ['edit', 'preview']),
  theme: read<Theme>('weave-theme', 'system', ['system', 'light', 'dark']),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  openBookmark: (bookmarkParent) => set({ bookmarkOpen: true, bookmarkParent }),
  closeBookmark: () => set({ bookmarkOpen: false }),
  setMode: (mode) => {
    write('weave-mode', mode)
    set({ mode })
  },
  setTheme: (theme) => {
    write('weave-theme', theme)
    set({ theme })
  },
}))
