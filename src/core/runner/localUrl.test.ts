import { describe, expect, it } from 'vitest'
import { extractLocalUrl } from './localUrl'

describe('extractLocalUrl', () => {
  it('extracts localhost URL with ANSI codes and normalizes 0.0.0.0', () => {
    const chunk = '\x1b[32m  ➜  Local:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\n'
    expect(extractLocalUrl(chunk)).toBe('http://localhost:5173/')
    expect(extractLocalUrl('Listening on http://0.0.0.0:8080/app.')).toBe('http://localhost:8080/app')
  })

  it('returns null when no local port URL is present', () => {
    expect(extractLocalUrl('building modules...')).toBeNull()
  })
})
