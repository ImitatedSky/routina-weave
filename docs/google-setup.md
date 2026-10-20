# Google 雲端硬碟同步：Google Cloud 設定步驟

Routina Weave 的雲端同步只要求一個權限：`https://www.googleapis.com/auth/drive.file`
（只能看到 Routina Weave 自己建立的檔案，看不到你雲端硬碟裡的其他東西）。
照下面的順序做一次就好，整個流程大約 15 分鐘。

會建立三個 OAuth 用戶端：

| 用途 | 類型 | 填到哪裡 |
| --- | --- | --- |
| 網頁版（pochunyeh.com、本機開發） | 網頁應用程式 | `.env.production` 與 GitHub 的 repository variable |
| Android 正式版（release 金鑰簽章） | Android | 不用填，Google 用 package + SHA-1 認 |
| Android 本機測試（debug 金鑰簽章） | Android | 不用填 |

---

## 1. 建立 Google Cloud 專案

1. 打開 <https://console.cloud.google.com/>，用要管理這個 App 的 Google 帳號登入。
2. 左上角的專案選單 →「新增專案」。
3. 專案名稱填 `Routina Weave`（隨意），按「建立」。
4. 建好後確認左上角已經切換到這個專案，後面每一步都在這個專案裡做。

## 2. 啟用 Google Drive API

1. 左側選單 →「API 和服務」→「程式庫」。
2. 搜尋 `Google Drive API`，點進去，按「啟用」。

## 3. 設定 OAuth 同意畫面

新版主控台把這部分叫「Google Auth Platform」（舊版叫「OAuth 同意畫面」），內容一樣。

1. 左側選單 →「API 和服務」→「OAuth 同意畫面」（會帶你到 Google Auth Platform），按「開始」。
2. **應用程式資訊**：應用程式名稱填 `Routina Weave`，使用者支援電子郵件選你自己的信箱。
3. **目標對象**：選「**外部**」（個人 Gmail 帳號只能選這個）。
4. **聯絡資訊**：填你的信箱。勾選同意政策，按「建立」。
5. 左側「**品牌塑造**」（Branding）：
   - 應用程式首頁：`https://pochunyeh.com/routina-weave/`
   - 已授權網域：新增 `pochunyeh.com`
   - **不要上傳應用程式標誌（logo）**：上傳 logo 會觸發 Google 的品牌審核，沒有 logo 就不需要。
   - 應用程式隱私權政策連結：`https://pochunyeh.com/routina-weave/privacy.html`（公開給別人用的 App，Google 規定一定要有）。服務條款可以留空。
   - 按「儲存」。
6. 左側「**資料存取**」（Data Access）→「新增或移除範圍」：
   - 在清單裡找到（或在下方「手動新增範圍」貼上）`https://www.googleapis.com/auth/drive.file`，勾選後按「更新」，再按「儲存」。
   - 它會出現在「**非敏感範圍**」那一區。只要這一個就好，不要加其他範圍。
7. 左側「**目標對象**」（Audience）→「測試使用者」→「新增使用者」，加入你自己要用的 Gmail。
   這一步讓你在下一步發布之前就能先測試。

### 發布為正式版（建議做）

在「測試」狀態下，Google 給的授權 **7 天就會失效**，之後每週都要重新同意一次，
而且只有測試使用者能連線。所以設定確認沒問題後：

1. 「目標對象」頁面 → 發布狀態旁邊按「**發布應用程式**」→ 確認。
2. 狀態變成「**正式版**」（In production）。

`drive.file` 屬於 **非敏感範圍**，加上沒有上傳 logo，所以發布為正式版 **不需要送 Google 審核**，
使用者也不會看到「這個應用程式未經 Google 驗證」的警告畫面。

## 4. 建立「網頁應用程式」用戶端

1. Google Auth Platform 左側「**用戶端**」（Clients）→「建立用戶端」。
2. 應用程式類型：「**網頁應用程式**」，名稱填 `Routina Weave Web`。
3. 「**已授權的 JavaScript 來源**」只填正式網站一筆（只填來源，不要加路徑、結尾不要斜線）：
   - `https://pochunyeh.com`

   > **資安提醒**：`pochunyeh.com` 底下還有 Tone、wordcards 等其他頁面，它們跟 Weave 是同一個 origin。
   > 其中任何一個出現 XSS，就能讀 Weave 的筆記、也能用這個用戶端 ID 要 token。
   > 如果打算把 Weave 搬到獨立子網域（例如 `weave.pochunyeh.com`），**最好在第一次連線前就搬**，
   > 這裡的來源也改填子網域；搬家後瀏覽器裡的本機筆記不會跟過去（可以先匯出 zip 或先同步到雲端）。

   本機開發要測登入的話，**另外建一個**「Routina Weave Dev」網頁用戶端，來源填
   `http://localhost:5173`（`npm run dev`）和 `http://localhost:4173`（`npm run preview`），
   用戶端 ID 寫進 `.env.development.local`。正式用戶端不要加 localhost。
4. 「已授權的重新導向 URI」**留空**（App 用的是彈出視窗拿 token，不需要）。
5. 按「建立」，畫面上的「**用戶端 ID**」（長得像 `1234567890-xxxx.apps.googleusercontent.com`）
   複製起來，第 6 步要用。網頁用戶端的「用戶端密碼」用不到，不用管它。

## 5. 建立兩個「Android」用戶端

Android 版不在程式裡填任何用戶端 ID：Play services 會把 App 的 **package 名稱**加上
**簽章金鑰的 SHA-1** 拿去跟這個 Cloud 專案裡的 Android 用戶端比對，對上了就是這個專案的 App。
所以兩把簽章金鑰各建一個用戶端。

### 5-1. 正式版（release 金鑰）

1. 「用戶端」→「建立用戶端」→ 應用程式類型「**Android**」。
2. 名稱：`Routina Weave Android (release)`
3. 套件名稱：`com.routina.weave`
4. SHA-1 憑證指紋：

   ```
   0C:E1:49:2A:E8:E0:6F:5C:BE:C2:02:E0:C2:6F:C1:30:77:FC:71:A1
   ```

   （來自 `C:\Users\User\Desktop\routina-release.jks`，alias `routina`。GitHub Actions 發版用的是同一把。）
5. 按「建立」。

### 5-2. 本機測試（debug 金鑰）

1. 再建一個「Android」用戶端。
2. 名稱：`Routina Weave Android (debug)`
3. 套件名稱：`com.routina.weave`
4. SHA-1 憑證指紋：

   ```
   F6:0E:D3:66:BA:6C:95:C7:9A:EF:7C:E7:0B:AC:4F:61:67:09:EC:40
   ```

   （來自這台電腦的 `~/.android/debug.keystore`，`./gradlew :app:assembleDebug` 用它簽章。
   換電腦或刪掉這個檔案，debug 金鑰就會變，要再加一個用戶端。）
5. 按「建立」。

### 以後要自己重算 SHA-1

```bash
# release（會問 keystore 密碼）
keytool -list -v -keystore C:\Users\User\Desktop\routina-release.jks -alias routina

# debug（密碼是 android）
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
```

看輸出裡的 `SHA1:` 那一行。

## 6. 把網頁用戶端 ID 填進專案

用戶端 ID 不是秘密（本來就會出現在網頁的 JavaScript 裡），可以放進 repo。

### 本機建置

在 repo 根目錄建立 `.env.production`：

```
VITE_GOOGLE_CLIENT_ID=1234567890-xxxx.apps.googleusercontent.com
```

`npm run build` / `npm run preview` 會讀這個檔案。`npm run dev` 讀的是另一個檔案，
要在本機開發時測試連線，建 `.env.development.local`，填第 4 步另外建的 Dev 用戶端 ID（`*.local` 不會進 git）。

### GitHub Actions（網頁部署與 APK 發版）

1. GitHub 上的 repo →「Settings」→「Secrets and variables」→「Actions」。
2. 切到「**Variables**」分頁（不是 Secrets）→「New repository variable」。
3. Name：`VITE_GOOGLE_CLIENT_ID`，Value：貼上網頁用戶端 ID，按「Add variable」。

`.github/workflows/deploy.yml` 與 `android.yml` 的 build 步驟會把這個變數傳給 `npm run build`。
沒設這個變數時會改用 `.env.production` 裡的值；兩個都沒有，網頁版就會隱藏同步功能。

### Android

不用填。只要第 5 步的 package 與 SHA-1 對得上就能連線。

## 7. 確認

- **網頁**：打開 <https://pochunyeh.com/routina-weave/>，按同步設定裡的連線按鈕，
  應該跳出 Google 的視窗，同意後回到 App。新建的用戶端可能要等幾分鐘才生效。
- **Android**：安裝 APK 後按連線，應該跳出系統的 Google 帳號選擇與同意畫面（不是網頁）。
  手機或模擬器要有 Google Play 服務並登入 Google 帳號。

### 常見錯誤

| 看到的訊息 | 原因 |
| --- | --- |
| 網頁：`Error 400: origin_mismatch` 或「origin is not allowed」 | 第 4 步的 JavaScript 來源沒加到目前網址（注意 http/https、port） |
| 網頁：「瀏覽器擋住了登入視窗」 | 允許這個網站的彈出視窗後再按一次 |
| Android：「Google 帳號連線的設定有誤」 | Play services 回 DEVELOPER_ERROR：package 或 SHA-1 跟第 5 步不符（例如用了別台電腦的 debug 金鑰） |
| Android：「這個版本無法連線 Google 帳號」 | 裝置沒有 Google Play 服務或版本太舊 |
| `access_denied`、「需要允許存取 Google 雲端硬碟」 | 使用者在同意畫面按了取消，或沒勾雲端硬碟的權限；還在「測試」狀態時，帳號不在測試使用者名單也會這樣 |
| 每過 7 天就要重新同意 | 同意畫面還在「測試」狀態，照第 3 步發布為正式版 |

## 已知限制

- **網頁版大約一小時要再按一次連線**：網頁用的是 Google Identity Services 的 token model，
  token 有效一小時，而且只放在記憶體裡（重新整理就沒了），沒有 refresh token。
  到期後同步會停下來，畫面顯示「按一下重新連線」；同意過一次之後，重新連線通常只是閃一下視窗。
- Android 版沒有這個問題：token 由 Play services 管理，到期會自動換新。
- 網頁版重新整理後才按「中斷連線」時，記憶體裡已經沒有 token，無法向 Google 撤銷授權。
  需要完全撤銷時，到 <https://myaccount.google.com/permissions> 移除 Routina Weave。
