import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

/**
 * GitHub Pages 不能加 header，只能用 <meta> 設 CSP（frame-ancestors 在 meta 裡無效，改由 main.tsx 擋 iframe）。
 * - script-src 不開 'unsafe-inline'：主題偵測放在 public/theme.js
 * - style-src 要 'unsafe-inline'：CodeMirror 會插 <style>，預覽的上色是 style 屬性
 * - img-src 要 https:：筆記裡的網址圖片、連結卡片的遠端縮圖
 * - connect-src：Drive API（含 upload/）、撤銷 token、GIS
 * - accounts.google.com/gsi/：Google 登入（GIS）的 script、樣式與 iframe
 * Android 殼一樣載這份 dist，'self' 在那邊是 https://appassets.androidplatform.net；
 * 原生 bridge 走 addWebMessageListener，不受 CSP 影響。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' blob: data: https:",
  "font-src 'self'",
  "connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com/gsi/",
  'frame-src https://accounts.google.com/gsi/',
  // 目前沒有用到 Worker；以後要加記得改成 'self'
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  'upgrade-insecure-requests',
].join('; ')

// 只在建置時加：開發伺服器有 inline 的 react-refresh 與 ws: 的 HMR
function contentSecurityPolicy(): Plugin {
  return {
    name: 'weave-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // 有人加回 inline <script> 的話 CSP 會把它擋掉，建置時就先報錯
        if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) throw new Error('index.html 不能有 inline <script>，會被 CSP 擋掉')
        return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }]
      },
    },
  }
}

export default defineConfig({
  // GitHub Pages 部署在 https://imitatedsky.github.io/routina-weave/ 子路徑下
  base: '/routina-weave/',
  plugins: [contentSecurityPolicy(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
