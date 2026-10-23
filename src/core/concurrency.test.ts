import { describe, expect, it } from 'vitest'
import { mapLimit } from './concurrency'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('mapLimit', () => {
  it('never runs more than `limit` tasks at once', async () => {
    let active = 0
    let peak = 0
    await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      active++
      peak = Math.max(peak, active)
      await sleep(10)
      active--
    })
    expect(peak).toBe(3)
  })

  it('keeps results in input order', async () => {
    const result = await mapLimit([30, 10, 20], 2, async (ms) => {
      await sleep(ms)
      return ms * 2
    })
    expect(result).toEqual([60, 20, 40])
  })

  it('handles empty input', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([])
  })
})
