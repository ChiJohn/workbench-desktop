import { vaultFile } from './notes'

export function splitAnswer(text: string): { body: string; sources: string[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let at = -1
  for (let i = 0; i < lines.length; i++) if (lines[i].trim() === 'SOURCES:') at = i
  if (at < 0) return { body: text.trim(), sources: [] }
  const sources = lines
    .slice(at + 1)
    .map(sourcePath)
    .filter(Boolean)
  return { body: lines.slice(0, at).join('\n').trim(), sources }
}

function sourcePath(line: string): string {
  let text = line.trim().replace(/^[-*]\s+/, '')
  const link = /^\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/.exec(text)
  if (link) text = link[1].trim()
  return text
}

export function keepSources(vaultPath: string, paths: string[]): { sources: string[]; dropped: number } {
  const sources: string[] = []
  for (const path of paths) {
    const kept = vaultFile(vaultPath, path)
    if (kept && !sources.includes(kept)) sources.push(kept)
  }
  return { sources, dropped: paths.length - sources.length }
}

export function parseDraft(text: string, fallbackTitle: string): { title: string; body: string } {
  const cleaned = text.trim()
  const lines = cleaned.split(/\r?\n/)
  const first = lines[0]?.trim() ?? ''
  const titled = /^TITLE:\s*(.+)$/.exec(first) || /^#\s+(.+)$/.exec(first)
  if (!titled) return { title: fallbackTitle, body: cleaned }
  return { title: titled[1].trim(), body: lines.slice(1).join('\n').trim() }
}
