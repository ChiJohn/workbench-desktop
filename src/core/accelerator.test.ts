import { describe, expect, it } from 'vitest'
import { acceleratorLabel, matchAccelerator } from '../shared/accelerator'

const chord = (key: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...extra
})

describe('matchAccelerator', () => {
  it('matches Ctrl+P and ignores extra modifiers', () => {
    expect(matchAccelerator('CommandOrControl+P', chord('p', { ctrlKey: true }))).toBe(true)
    expect(matchAccelerator('CommandOrControl+P', chord('p', { metaKey: true }))).toBe(true)
    expect(matchAccelerator('CommandOrControl+P', chord('p', { ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(matchAccelerator('CommandOrControl+P', chord('k', { ctrlKey: true }))).toBe(false)
  })

  it('treats an empty accelerator as disabled', () => {
    expect(matchAccelerator('', chord('p', { ctrlKey: true }))).toBe(false)
  })
})

describe('acceleratorLabel', () => {
  it('shows CommandOrControl as Ctrl', () => {
    expect(acceleratorLabel('CommandOrControl+P')).toBe('Ctrl+P')
    expect(acceleratorLabel('CommandOrControl+Shift+K')).toBe('Ctrl+Shift+K')
  })
})
