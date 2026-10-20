/**
 * 被嵌進 iframe 時，畫面上只留一個在新分頁開啟的連結。
 * 不用 top.location 跳出去：sandbox 的 iframe 可以禁止頂層導覽，也會跟外層頁面搶導覽。
 */
export function showFrameGuard(root: HTMLElement) {
  const link = document.createElement('a')
  link.href = location.href
  link.target = '_blank'
  link.rel = 'noopener'
  link.textContent = '在新分頁開啟 Weave'
  link.className = 'm-6 inline-block text-primary underline'
  root.replaceChildren(link)
}
