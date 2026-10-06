# Routina Weave

筆記與知識圖譜 App，像 Obsidian 加上一點 Notion：每則筆記都是一個 Markdown 檔，用 `[[連結]]` 把筆記織成一張網。網頁版：https://imitatedsky.github.io/routina-weave/

Android 版是 Routina 家族的一員，從 Routina Hub 安裝，或到 Releases 下載 `routina-weave-v*.apk`。

## 功能

- Markdown 編輯與預覽，`[[筆記]]` 雙向連結、反向連結、`#標籤`
- 頁面可以有子頁面（像資料夾），子頁面可以用清單、表格、圖庫顯示，並有自訂屬性
- 範本：新頁面可以套用範本，支援 `{{title}}`、`{{date}}`、`{{time}}`
- 網址收藏：貼上網址自動抓標題、說明與縮圖（目前只有 Android 版會抓）
- 知識圖譜：看筆記之間怎麼連起來
- 淺色／深色，跟隨系統或手動切換
- 匯出成 zip（每則筆記一個 .md，子頁面放在同名資料夾裡）；匯入 zip 或 .md，Obsidian、Notion 匯出的也可以
- 資料存在本機（IndexedDB），不需要帳號

## 檔案格式

匯出的 zip：

```
書單.md
書單/原子習慣.md          ← 子頁面放在與上層同名的資料夾
_templates/讀書筆記.md     ← 範本
_attachments/<id>.jpg      ← 附件（網址縮圖）
```

每個 .md 是 YAML frontmatter 加上 Markdown 內文（`src/notes/markdown.ts`）：

```md
---
id: 6f0c…
title: 原子習慣
parent: 2b1a…
order: 0
tags: [讀書]
created: 2026-10-06T08:00:00.000Z
updated: 2026-10-06T09:30:00.000Z
---

內文……
```

| 欄位 | 說明 |
|---|---|
| `id` | 筆記的 id。匯入時同 id 的以 `updated` 較新的為準 |
| `title` | 標題 |
| `parent` | 上層頁面的 id，最上層是 `null` |
| `order` | 同一層裡的排序，小的在前 |
| `icon` | 圖示（emoji） |
| `tags` | 標籤（內文的 `#標籤` 不寫在這裡，讀取時另外解析） |
| `url`、`site`、`description` | 網址筆記的網址、網站名稱、說明 |
| `image` | 縮圖的附件 id，檔案在 `_attachments/` |
| `props` | 自訂屬性，值是字串、數字或布林 |
| `template` | `true` 表示這則是範本 |
| `childTemplate` | 在這一頁底下新增子頁面時預設套用的範本 id |
| `view` | 子頁面的顯示方式：`list`、`table`、`gallery` |
| `pinned` | 釘選 |
| `created`、`updated` | 建立與最後修改時間（ISO 8601） |

沒寫的欄位用預設值；不認得的欄位讀進來會原樣保留，寫回去時不會掉。

匯入沒有 `id` 的 .md（例如從 Obsidian、Notion 來的）時：給新 id、標題用檔名（Notion 檔名後面的 hash 會拿掉），上層由資料夾推出來——`X/` 資料夾的上層是同一層的 `X.md`，沒有的話自動建一個空頁面。整包包在同一個資料夾裡時會先把那層拿掉。

## 開發

```sh
npm install
npm run dev
npm test
npm run build
```

| 目錄 | 內容 |
|---|---|
| `src/notes/` | 筆記的資料格式、Markdown 轉換、連結、範本 |
| `src/storage/` | IndexedDB：筆記、附件 |
| `src/store/` | 狀態（zustand）：筆記、路由、介面設定 |
| `src/editor/` | CodeMirror 編輯器 |
| `src/components/` | 介面 |
| `src/lib/` | 平台相關：存檔、網址預覽、zip 匯出匯入 |

## Android 殼（`android/`）

整個畫面是一個 WebView，載入打包進 APK 的 `dist/`（掛在 `https://appassets.androidplatform.net/routina-weave/`，IndexedDB 才可靠）。外部連結（包括 `target="_blank"` 與 `window.open`）交給瀏覽器。

網頁在 App 裡做不到的事走 JS bridge：

| bridge | 呼叫 | 回呼 | 網頁端 |
|---|---|---|---|
| `RoutinaWeaveFiles`（`FileSaver.kt`） | `saveFile(id, base64, filename, mimeType)`，跳系統的「另存新檔」 | `window.__weaveSaveResult(id, status, message)`，status 是 `saved`／`cancelled`／`error` | `src/lib/saveFile.ts` |
| `RoutinaWeaveLinks`（`LinkPreviewer.kt`） | `fetchPreview(id, url)`，抓網頁的 og:title、description、縮圖 | `window.__weavePreviewResult(id, json)` | `src/lib/linkPreview.ts` |

唯一的權限是 `INTERNET`，只用在網址預覽；預覽只允許 http/https，並拒絕連到本機與私有網段。

```sh
npm run build
cd android && ./gradlew :app:assembleDebug
```

`android/local.properties`（不進版控）要指到 Android SDK：

```
sdk.dir=C\:\\Users\\User\\AppData\\Local\\Android\\Sdk
```

發版：`android/app/build.gradle.kts` 的 `versionName` 改好 → commit → `git tag vX.Y.Z` → push tag。CI（`.github/workflows/android.yml`）檢查 tag 與 versionName 一致後簽章並建 Release；簽章用家族共用的 keystore，放在 repo 的 secrets（`KEYSTORE_BASE64`、`KEYSTORE_PASSWORD`、`KEY_ALIAS`、`KEY_PASSWORD`）。push main 會由 `.github/workflows/deploy.yml` 部署網頁版到 GitHub Pages。
