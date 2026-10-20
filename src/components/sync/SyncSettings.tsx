import { useEffect, useState } from 'react'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { prepareSignIn } from '@/sync/auth'
import { connect, disconnect, syncNow, useSync } from '@/sync/service'
import { SyncStatusText } from './SyncStatusText'

/** 設定頁的「Google 雲端同步」區塊 */
export function SyncSettings() {
  const { status, email, error, lastReport } = useSync()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  // 網頁版要先載好 Google 的登入腳本，按下按鈕時才能立刻開視窗（不然會被瀏覽器擋）
  useEffect(() => {
    if (status === 'disconnected' || status === 'reconnect') prepareSignIn()
  }, [status])

  if (status === 'unavailable') {
    return (
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Google 雲端同步</h2>
        <p className="text-sm text-muted-foreground">這個版本還沒有設定 Google 帳號連線。</p>
      </section>
    )
  }

  const connected = status !== 'disconnected' && status !== 'reconnect'

  const onConnect = () => {
    // 不能先 await 別的東西：網頁版的登入視窗必須在點擊當下開
    setBusy(true)
    void connect().finally(() => setBusy(false))
  }

  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Google 雲端同步</h2>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          {connected ? <Cloud className="mt-0.5 size-5 text-primary" /> : <CloudOff className="mt-0.5 size-5 text-muted-foreground" />}
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">{connected ? (email ?? '已連線') : status === 'reconnect' ? 'Google 雲端硬碟' : '尚未連線'}</div>
            <SyncStatusText className="text-muted-foreground" />
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          筆記會存成 .md 檔放在你的雲端硬碟「Routina Weave」資料夾。Weave 只能看到自己建立的檔案，碰不到雲端硬碟裡其他東西。
          <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer" className="ml-1 underline underline-offset-2">
            隱私權政策
          </a>
        </p>

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        {lastReport && lastReport.conflicts > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            有 {lastReport.conflicts} 則筆記兩邊都改過，另一個版本存成了「衝突副本」。
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {connected ? (
            <>
              {status !== 'account-mismatch' && (
                <Button variant="outline" onClick={() => void syncNow()} disabled={status === 'syncing'}>
                  <RefreshCw className={status === 'syncing' ? 'animate-spin' : undefined} />
                  立即同步
                </Button>
              )}
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                中斷連線
              </Button>
            </>
          ) : (
            <Button onClick={onConnect} disabled={busy}>
              <Cloud />
              {status === 'reconnect' ? '重新連線' : '連線 Google 雲端硬碟'}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>中斷 Google 雲端同步？</DialogTitle>
            <DialogDescription>
              會撤銷 Weave 對雲端硬碟的授權。這台裝置上的筆記和雲端硬碟裡的檔案都不會刪除，之後可以再連線。
              也可以到 Google 帳戶的「第三方連結」確認 Weave 已經移除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false)
                void disconnect()
              }}
            >
              中斷連線
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
