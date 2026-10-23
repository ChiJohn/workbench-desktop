import type { Project, ProjectType, SkippedRow } from '../../shared/types'
import { normalizeRepoPath } from '../paths'

export type ParsedProject = Omit<Project, 'available' | 'unavailableReason'>

export interface ParseResult {
  projects: ParsedProject[]
  skipped: SkippedRow[]
}

const SECTION_HEADING = /^##\s+已确认映射\s*$/
const ANY_SECTION_HEADING = /^#{1,2}\s/
const SEPARATOR_ROW = /^\|[\s:|-]+\|$/

const TYPE_MAP: Record<string, ProjectType> = {
  小程序应用: 'miniapp',
  H5应用: 'h5',
  后台前端仓库: 'admin',
  PC前端仓库: 'pc',
  CLI仓库: 'cli'
}

/** 按未转义、且不在 `[[...]]` 内的 `|` 切分表格行 */
function splitRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let linkDepth = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') {
      current += '\\|'
      i++
    } else if (ch === '[' && line[i + 1] === '[') {
      linkDepth++
      current += '[['
      i++
    } else if (ch === ']' && line[i + 1] === ']') {
      linkDepth = Math.max(0, linkDepth - 1)
      current += ']]'
      i++
    } else if (ch === '|' && linkDepth === 0) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  // 去掉行首行尾 `|` 产生的空单元格
  return cells.slice(1, -1)
}

function parseWikilink(cell: string): { target: string; name: string } | null {
  const m = cell.match(/\[\[([^\]]+?)(?:\\?\|[^\]]*)?\]\]/)
  if (!m) return null
  const target = m[1].trim()
  const homepage = target.match(/Projects\/([^/]+)\/主页$/)
  const name = homepage ? homepage[1] : target.split('/').pop()!
  return { target, name }
}

export function parseRepoMap(markdown: string): ParseResult {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((l) => SECTION_HEADING.test(l.trim()))
  if (start === -1) {
    return { projects: [], skipped: [{ line: 0, raw: '', reason: '未找到「## 已确认映射」章节' }] }
  }

  const projects: ParsedProject[] = []
  const skipped: SkippedRow[] = []
  const seen = new Set<string>()
  let tableRow = -1

  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (ANY_SECTION_HEADING.test(line)) break
    if (!line.startsWith('|')) {
      if (tableRow >= 0) break
      continue
    }
    tableRow++
    if (tableRow === 0 || SEPARATOR_ROW.test(line)) continue

    const skip = (reason: string) => skipped.push({ line: i + 1, raw, reason })
    const [linkCell = '', pathCell = '', typeCell = '', noteCell = ''] = splitRow(line)

    const link = parseWikilink(linkCell)
    if (!link) {
      skip('缺少 Obsidian 项目链接')
      continue
    }
    const pathMatch = pathCell.match(/`([^`]+)`/)
    if (!pathMatch) {
      skip('缺少仓库路径')
      continue
    }
    const repoPath = pathMatch[1].trim()
    const id = normalizeRepoPath(repoPath)
    if (seen.has(id)) {
      skip('重复的仓库路径，已合并到首条')
      continue
    }
    seen.add(id)

    projects.push({
      id,
      name: link.name,
      obsidianLink: link.target,
      repoPath,
      type: TYPE_MAP[typeCell.replace(/\s+/g, '')] ?? 'other',
      note: noteCell
    })
  }

  return { projects, skipped }
}
