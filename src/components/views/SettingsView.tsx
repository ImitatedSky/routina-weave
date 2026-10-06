import { useUi, type Theme } from '@/store/ui'
import { cn } from '@/lib/utils'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '跟隨系統' },
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
]

export function SettingsView() {
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-24 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">設定</h1>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">外觀</h2>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={cn('rounded-lg border px-3 py-2 text-sm', theme === t.value && 'border-primary bg-accent text-accent-foreground')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* TODO(Android agent)：匯出／匯入 zip */}
    </div>
  )
}
