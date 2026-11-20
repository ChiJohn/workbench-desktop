import { describe, expect, it } from 'vitest'
import {
  CLOUD_MULTICA_WEB_URL,
  DEFAULT_MULTICA_WEB_URL,
  isEmbeddableMulticaUrl,
  multicaPanelUrl,
  normalizeMulticaWebUrl
} from '../../shared/multicaWeb'

describe('multica web url', () => {
  it('defaults to the local docker root', () => {
    expect(normalizeMulticaWebUrl('')).toBe(DEFAULT_MULTICA_WEB_URL)
    expect(normalizeMulticaWebUrl(undefined)).toBe('http://localhost:3000')
  })

  it('keeps a configured cloud page and a bare host', () => {
    expect(normalizeMulticaWebUrl('https://multica.ai/jinbi/issues/')).toBe(CLOUD_MULTICA_WEB_URL)
    expect(normalizeMulticaWebUrl('localhost:3000')).toBe('http://localhost:3000')
  })

  it('moves an issue onto the configured origin and keeps the path', () => {
    expect(multicaPanelUrl('https://multica.ai/jinbi/issues/JINB-1', 'http://localhost:3000')).toBe(
      'http://localhost:3000/jinbi/issues/JINB-1'
    )
  })

  it('keeps the issue on the cloud when that page is configured', () => {
    expect(multicaPanelUrl('https://www.multica.ai/jinbi/issues/JINB-1?tab=comments', CLOUD_MULTICA_WEB_URL)).toBe(
      'https://multica.ai/jinbi/issues/JINB-1?tab=comments'
    )
  })

  it('opens the configured page when there is no specific link', () => {
    expect(multicaPanelUrl(undefined, CLOUD_MULTICA_WEB_URL)).toBe(CLOUD_MULTICA_WEB_URL)
  })

  it('leaves other sites outside the panel', () => {
    expect(multicaPanelUrl('https://www.tapd.cn/123', DEFAULT_MULTICA_WEB_URL)).toBeNull()
    expect(isEmbeddableMulticaUrl('https://example.com', DEFAULT_MULTICA_WEB_URL)).toBe(false)
  })

  it('embeds cloud, localhost, and the configured origin', () => {
    expect(isEmbeddableMulticaUrl(CLOUD_MULTICA_WEB_URL, DEFAULT_MULTICA_WEB_URL)).toBe(true)
    expect(isEmbeddableMulticaUrl('http://127.0.0.1:3000/jinbi/issues', DEFAULT_MULTICA_WEB_URL)).toBe(true)
    expect(isEmbeddableMulticaUrl('http://192.168.1.8:3000/jinbi', 'http://192.168.1.8:3000')).toBe(true)
  })
})
