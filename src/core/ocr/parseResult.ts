/** 解析 OCR 服务返回的 JSON；若夹杂日志，取最后一行对象 */
export function parseOcrResult(raw: string): { text: string; meaning: string; error?: string } {
  const line = raw
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.startsWith('{'))
    .at(-1)
  if (!line) throw new Error(raw.trim().slice(0, 400) || '没有返回结果')
  const parsed = JSON.parse(line) as { text?: string; meaning?: string; error?: string }
  return { text: parsed.text || '', meaning: parsed.meaning || '', error: parsed.error?.trim() || undefined }
}
