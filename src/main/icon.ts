import { nativeImage, type NativeImage } from 'electron'

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** 运行时绘制的图标：蓝色圆角方块上的 `>_` 终端提示符 */
export function createAppIcon(size = 32): NativeImage {
  const buf = Buffer.alloc(size * size * 4)
  const s = size / 32
  const radius = 7 * s
  const strokes: [number, number, number, number][] = [
    [9, 10, 16, 16],
    [16, 16, 9, 22],
    [18, 22, 24, 22]
  ].map(([a, b, c, d]) => [a * s, b * s, c * s, d * s])

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.max(radius, Math.min(size - radius, x + 0.5))
      const cy = Math.max(radius, Math.min(size - radius, y + 0.5))
      const inside = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius
      if (!inside) continue
      const onStroke = strokes.some(([ax, ay, bx, by]) => distanceToSegment(x + 0.5, y + 0.5, ax, ay, bx, by) < 1.6 * s)
      const i = (y * size + x) * 4
      // BGRA
      if (onStroke) buf.set([255, 255, 255, 255], i)
      else buf.set([255, 128, 64, 255], i)
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}
