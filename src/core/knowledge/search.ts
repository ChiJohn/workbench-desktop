import { AppError } from '../result'

export interface RawSearchHit {
  file: string
  matches: { line?: number; text?: string }[]
}

export interface SearchGroup {
  file: string
  snippets: string[]
}

const SNIPPET_MAX = 200

export function searchArgs(vaultName: string, query: string, limit: number): string[] {
  return [`vault=${vaultName}`, 'search:context', `query=${query}`, 'format=json', `limit=${limit}`]
}

export function parseSearchOutput(stdout: string): RawSearchHit[] {
  const text = stdout.trim()
  if (!text || /^no matches found\.?$/i.test(text)) return []
  const start = text.indexOf('[')
  const objectStart = text.indexOf('{')
  const at = start >= 0 && (objectStart < 0 || start < objectStart) ? start : objectStart
  if (at < 0) throw new AppError('KNOWLEDGE_CLI_FAILED', 'Obsidian 搜索没有返回 JSON')
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(at))
  } catch {
    throw new AppError('KNOWLEDGE_CLI_FAILED', 'Obsidian 搜索结果无法解析')
  }
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return list.map((item) => {
    const row = item as { file?: string; path?: string; matches?: { line?: number; text?: string }[] }
    return { file: String(row.file ?? row.path ?? ''), matches: row.matches ?? [] }
  })
}

const skip = (file: string) => file.startsWith('汇报/') || file.startsWith('附件/')

function rank(file: string, project?: string): number {
  if (project && (file.startsWith(`项目/${project}/`) || file.startsWith(`知识/${project}`))) return 0
  if (file.startsWith('知识/')) return 1
  if (file.startsWith('项目/')) return 2
  if (file.startsWith('任务/')) return 3
  if (file.startsWith('问答/')) return 5
  return 4
}

export function cleanSearch(hits: RawSearchHit[], limit = 12, project?: string): SearchGroup[] {
  const groups: SearchGroup[] = []
  for (const hit of hits) {
    const file = hit.file.replace(/\\/g, '/').replace(/^\//, '')
    if (!file || skip(file)) continue
    const seen = new Set<string>()
    const snippets: string[] = []
    for (const match of hit.matches) {
      let text = (match.text ?? '').replace(/\s+/g, ' ').trim()
      if (!text || seen.has(text)) continue
      seen.add(text)
      if (text.length > SNIPPET_MAX) text = `${text.slice(0, SNIPPET_MAX)}…`
      snippets.push(text)
    }
    if (snippets.length) groups.push({ file, snippets })
  }
  return groups.sort((a, b) => rank(a.file, project) - rank(b.file, project) || a.file.localeCompare(b.file, 'zh')).slice(0, limit)
}
