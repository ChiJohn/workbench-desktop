import { describe, expect, it } from 'vitest'
import { LineBuffer } from './lineBuffer'

describe('LineBuffer', () => {
  it('joins chunks that split a line', () => {
    const b = new LineBuffer(10)
    b.append('hel')
    b.append('lo\nwor')
    b.append('ld\n')
    expect(b.toString()).toBe('hello\nworld\n')
  })

  it('keeps only the last `max` complete lines plus the partial line', () => {
    const b = new LineBuffer(3)
    b.append('1\n2\n3\n4\n5\npartial')
    expect(b.toString()).toBe('3\n4\n5\npartial')
  })

  it('can be cleared', () => {
    const b = new LineBuffer(3)
    b.append('a\nb')
    b.clear()
    expect(b.toString()).toBe('')
  })
})
