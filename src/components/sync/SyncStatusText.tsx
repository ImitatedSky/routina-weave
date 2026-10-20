import { useEffect, useState } from 'react'
import { useSync } from '@/sync/service'
import { cn } from '@/lib/utils'

/** 「上次同步：3 分鐘前」之類的一行狀態，設定頁與側邊欄共用 */
export function SyncStatusText({ className }: { className?: string }) {
  const { status, lastSync } = useSync()
  // 每分鐘重畫一次，「幾分鐘前」才會跟著走
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  let text: string
  switch (status) {
    case 'syncing':
      text = '同步中…'
      break
    case 'offline':
      text = '離線中，恢復網路後會自動同步'
      break
    case 'error':
      text = '同步失敗，稍後會再試'
      break
    case 'reconnect':
      text = '需要重新連線才能繼續同步'
      break
    case 'account-mismatch':
      text = '帳號不同，已暫停同步'
      break
    case 'disconnected':
      text = '筆記只存在這台裝置'
      break
    default:
      text = lastSync ? `上次同步：${ago(lastSync, now)}` : '已連線，還沒同步過'
  }
  return <div className={cn('truncate', className)}>{text}</div>
}

function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  return new Date(iso).toLocaleDateString('zh-TW')
}
