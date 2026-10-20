import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
import { showFrameGuard } from './frameGuard'

// 被別的網站用 iframe 嵌入時不渲染 App，免得被誘騙點擊（GitHub Pages 不能設 frame-ancestors）
if (window.top !== window.self) {
  showFrameGuard(document.getElementById('root')!)
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
