import { describe, expect, it } from 'vitest'
import { parseViewerUrl } from './viewerUrl'

describe('parseViewerUrl', () => {
  it('extracts tokenized localhost URL from mixed output', () => {
    const text = 'Starting…\nOpen http://127.0.0.1:5173/?token=abc123-def in your browser\n'
    expect(parseViewerUrl(text)).toBe('http://127.0.0.1:5173/?token=abc123-def')
  })

  it('returns null when no URL is present', () => {
    expect(parseViewerUrl('downloading packages…')).toBeNull()
  })
})
