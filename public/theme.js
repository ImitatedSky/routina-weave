// 在 React 載入前就決定深淺色，避免先閃一下白底。
// 放成外部檔而不是 inline：CSP 的 script-src 不開 'unsafe-inline'
try {
  var t = localStorage.getItem('weave-theme')
  var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
} catch (e) {}
