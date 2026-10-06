/**
 * 圖譜的顏色從 CSS 變數來。變數是 oklch，canvas 又要用不同透明度畫同一個顏色，
 * 所以先畫到 1×1 的 canvas 上讀回 rgba。
 */

type Rgba = [number, number, number, number]

export interface Palette {
  primary: Rgba
  foreground: Rgba
  muted: Rgba
  border: Rgba
  background: Rgba
}

let probe: CanvasRenderingContext2D | null = null

function toRgba(css: string): Rgba {
  if (!probe) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    probe = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!probe) return [128, 128, 128, 1]
  probe.clearRect(0, 0, 1, 1)
  // 不認得的顏色會沿用上一次的 fillStyle，先設成灰色當退路
  probe.fillStyle = '#888'
  probe.fillStyle = css
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

export function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string) => toRgba(style.getPropertyValue(name).trim())
  return {
    primary: read('--primary'),
    foreground: read('--foreground'),
    muted: read('--muted-foreground'),
    border: read('--border'),
    background: read('--background'),
  }
}

export function rgba([r, g, b, a]: Rgba, alpha = 1): string {
  return `rgba(${r},${g},${b},${a * alpha})`
}
