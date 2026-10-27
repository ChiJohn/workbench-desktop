import { describe, expect, it } from 'vitest'
import { clampFab, placePanel } from '../shared/fabPosition'

describe('fab position', () => {
  it('clamps the button inside the viewport', () => {
    expect(clampFab(-20, 900, { w: 1200, h: 800 })).toEqual({ x: 8, y: 752 })
  })

  it('places the panel above the button and aligns the right edges', () => {
    expect(placePanel({ x: 1000, y: 700 }, { w: 380, h: 200 }, { w: 1200, h: 800 })).toEqual({ x: 660, y: 492 })
  })

  it('drops the panel below when the top is too tight, and keeps it on screen', () => {
    expect(placePanel({ x: 100, y: 20 }, { w: 320, h: 260 }, { w: 1200, h: 800 })).toEqual({ x: 8, y: 68 })
  })
})
