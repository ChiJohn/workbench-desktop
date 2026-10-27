import { describe, expect, it } from 'vitest'
import { moveToolbarItem, normalizeToolbarOrder } from '../shared/toolbarOrder'

describe('toolbar order', () => {
  it('fills missing buttons and drops unknown ones', () => {
    expect(normalizeToolbarOrder(['settings', 'nope', 'settings', 'tasks'])).toEqual([
      'settings',
      'tasks',
      'overview',
      'agents',
      'reports',
      'knowledge',
      'gap',
      'fetch',
      'refresh'
    ])
  })

  it('moves a button onto another without losing the gap', () => {
    const order = normalizeToolbarOrder(null)
    const moved = moveToolbarItem(order, 'settings', 'overview')
    expect(moved[0]).toBe('settings')
    expect(moved.filter((id) => id === 'gap')).toEqual(['gap'])
    expect(new Set(moved).size).toBe(order.length)
  })

  it('leaves the gap where it is when something is dropped on it', () => {
    const order = normalizeToolbarOrder(null)
    expect(moveToolbarItem(order, 'gap', 'settings')).toBe(order)
  })
})
