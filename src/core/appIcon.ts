/** BGRA。标准色给托盘；任务栏用更亮的 #9ad4ff，方格用纯白 */
const TONES = {
  standard: {
    accent: [255, 168, 94, 255] as [number, number, number, number],
    mark: [250, 245, 242, 255] as [number, number, number, number]
  },
  bright: {
    accent: [255, 212, 154, 255] as [number, number, number, number],
    mark: [255, 255, 255, 255] as [number, number, number, number]
  }
}

export type AppIconTone = keyof typeof TONES

function insideRounded(x: number, y: number, size: number, radius: number): boolean {
  const cx = Math.max(radius, Math.min(size - radius, x))
  const cy = Math.max(radius, Math.min(size - radius, y))
  return Math.hypot(x - cx, y - cy) <= radius
}

function inPane(x: number, y: number, size: number): boolean {
  const margin = size * 0.2
  const gap = size * 0.08
  const pane = (size - margin * 2 - gap) / 2
  const origins = [margin, margin + pane + gap]
  const inSpan = (value: number) => origins.some((origin) => value >= origin && value < origin + pane)
  return inSpan(x) && inSpan(y)
}

/** 圆角方块上的四格工作台。托盘用 standard，任务栏用 bright */
export function renderAppIcon(size: number, tone: AppIconTone = 'standard'): Buffer {
  const colors = TONES[tone]
  const buf = Buffer.alloc(size * size * 4)
  const radius = size * 0.22
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      if (!insideRounded(px, py, size, radius)) continue
      buf.set(inPane(px, py, size) ? colors.mark : colors.accent, (y * size + x) * 4)
    }
  }
  return buf
}
