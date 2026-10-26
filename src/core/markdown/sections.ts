const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 首个 frontmatter 块的简单 `key: value` 对，值去掉外层引号 */
export function readFrontmatter(md: string): Record<string, string> {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line)
    if (kv) out[kv[1]] = kv[2].trim().replace(/^'(.*)'$/, (_s, v: string) => v.replace(/''/g, "'")).replace(/^"(.*)"$/, '$1')
  }
  return out
}

/** 在首个 frontmatter 块中设置 `key: value`（value 原样写入） */
export function setFrontmatter(md: string, key: string, value: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  if (!m) return `---\n${key}: ${value}\n---\n\n${md}`
  const lines = m[1].split(/\r?\n/)
  const i = lines.findIndex((l) => l.startsWith(`${key}:`))
  if (i >= 0) lines[i] = `${key}: ${value}`
  else lines.push(`${key}: ${value}`)
  return `---\n${lines.join('\n')}\n---${md.slice(m[0].length)}`
}

function sectionRange(md: string, heading: string): { start: number; end: number } | null {
  const m = new RegExp(`^## ${escapeRegExp(heading)}[ \\t]*\\r?$`, 'm').exec(md)
  if (!m) return null
  const start = m.index + m[0].length
  const next = /^## /m.exec(md.slice(start))
  return { start, end: next ? start + next.index : md.length }
}

/** 二级标题小节的正文（去掉首尾空白）；没有该小节时为 null */
export function readSection(md: string, heading: string): string | null {
  const range = sectionRange(md, heading)
  return range ? md.slice(range.start, range.end).trim() : null
}

/** 改写二级标题小节；没有时追加到末尾 */
export function writeSection(md: string, heading: string, body: (current: string) => string): string {
  const range = sectionRange(md, heading)
  if (!range) return md.trim() ? `${md.replace(/\s*$/, '')}\n\n## ${heading}\n\n${body('')}\n` : `## ${heading}\n\n${body('')}\n`
  const current = md.slice(range.start, range.end).trim()
  const tail = range.end < md.length ? '\n\n' : '\n'
  return `${md.slice(0, range.start)}\n\n${body(current)}${tail}${md.slice(range.end)}`
}

export function appendToSection(md: string, heading: string, line: string): string {
  return writeSection(md, heading, (current) => (current ? `${current}\n${line}` : line))
}

export function replaceSection(md: string, heading: string, body: string): string {
  return writeSection(md, heading, () => body.trim())
}
