/** 微信开发者工具 `--qr-format base64` 在部分版本仍写出二进制 JPEG/PNG，不能当 UTF-8 文本读 */

const isPng = (b: Buffer) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
const isJpeg = (b: Buffer) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

const BASE64_RE = /^[A-Za-z0-9+/=\r\n]+$/

/** 把 CLI 写出的二维码文件内容转成可给 `<img src>` 用的 data URL */
export function qrToDataUrl(raw: Buffer): string {
  if (!raw.length) throw new Error('二维码文件为空')
  if (isJpeg(raw)) return `data:image/jpeg;base64,${raw.toString('base64')}`
  if (isPng(raw)) return `data:image/png;base64,${raw.toString('base64')}`

  const text = raw.toString('utf8').replace(/^\uFEFF/, '').trim()
  if (text.startsWith('data:image/')) return text
  const b64 = text.replace(/\s+/g, '')
  if (b64.length >= 4 && BASE64_RE.test(b64)) return `data:image/png;base64,${b64}`
  throw new Error('无法识别的二维码文件格式')
}
