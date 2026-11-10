import { describe, expect, it } from 'vitest'
import { renderAppIcon } from './appIcon'

const pixel = (buf: Buffer, size: number, x: number, y: number) => {
  const i = (y * size + x) * 4
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]
}

describe('app icon', () => {
  it('draws a blue tile with four light panes and transparent corners', () => {
    const size = 32
    const buf = renderAppIcon(size)
    expect(buf).toHaveLength(size * size * 4)
    expect(pixel(buf, size, 0, 0)).toEqual([0, 0, 0, 0])
    expect(pixel(buf, size, 8, 8)).toEqual([250, 245, 242, 255])
    expect(pixel(buf, size, 16, 16)).toEqual([255, 168, 94, 255])
    expect(pixel(buf, size, 23, 8)).toEqual([250, 245, 242, 255])
  })

  it('draws a lighter tile for the taskbar', () => {
    const size = 32
    const buf = renderAppIcon(size, 'bright')
    expect(pixel(buf, size, 8, 8)).toEqual([255, 255, 255, 255])
    expect(pixel(buf, size, 16, 16)).toEqual([255, 212, 154, 255])
  })
})
