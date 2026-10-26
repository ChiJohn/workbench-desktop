import { describe, expect, it } from 'vitest'
import { qrToDataUrl } from './qrDataUrl'

describe('qrToDataUrl', () => {
  it('encodes a binary JPEG as a jpeg data URL', () => {
    // FF D8 FF E0 … JFIF（微信 CLI 在 --qr-format base64 时实际写出的格式）
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01])
    expect(qrToDataUrl(jpeg)).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`)
  })

  it('encodes a binary PNG as a png data URL', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
    expect(qrToDataUrl(png)).toBe(`data:image/png;base64,${png.toString('base64')}`)
  })

  it('keeps an existing data URL and strips a BOM / surrounding whitespace', () => {
    expect(qrToDataUrl(Buffer.from('\uFEFF  data:image/png;base64,QUJD\n'))).toBe('data:image/png;base64,QUJD')
  })

  it('treats plain base64 text as a png (older CLI / fake cli)', () => {
    expect(qrToDataUrl(Buffer.from('QUJD\n'))).toBe('data:image/png;base64,QUJD')
  })

  it('rejects empty or unrecognized content', () => {
    expect(() => qrToDataUrl(Buffer.alloc(0))).toThrow(/空/)
    expect(() => qrToDataUrl(Buffer.from('not-a-qr'))).toThrow(/无法识别/)
  })
})
