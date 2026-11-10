import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { AppError } from '../util/result.js'

export type ProjectKind = 'miniapp' | 'admin' | 'h5' | 'pc' | 'cli' | 'desktop' | 'frontend' | 'other'

export interface ProjectItem {
  id: string
  name: string
  repoPath: string
  type: ProjectKind
  typeLabel: string
  note: string
  obsidianLink: string
  available: boolean
  unavailableReason?: string | undefined
}

export interface SkippedRow {
  line: number
  raw: string
  reason: string
}

export interface ListProjectsResult {
  projects: ProjectItem[]
  total: number
  availableCount: number
  mapFilePath: string
  markdown: string
}

const SECTION_HEADING = /^##\s+已确认映射\s*$/
const ANY_SECTION_HEADING = /^#{1,2}\s/
const SEPARATOR_ROW = /^\|[\s:|-]+\|$/

export const TYPE_MAP: Record<string, ProjectKind> = {
  小程序应用: 'miniapp',
  小程序: 'miniapp',
  后台前端仓库: 'admin',
  后台: 'admin',
  H5应用: 'h5',
  H5: 'h5',
  PC前端仓库: 'pc',
  PC: 'pc',
  CLI仓库: 'cli',
  CLI: 'cli',
  桌面应用: 'desktop',
  前端仓库: 'frontend',
  其他: 'other'
}

export function splitRow(line: string): string[] {
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
  return cells.slice(1, -1)
}

export function parseWikilink(cell: string): { target: string; name: string } | null {
  const m = cell.match(/\[\[([^\]]+?)(?:\\?\|[^\]]*)?\]\]/)
  if (!m) return null
  const target = m[1]!.trim()
  const homepage = target.match(/(?:Projects|项目)\/([^/]+)\/主页$/)
  const name = homepage ? homepage[1]! : target.split('/').pop()!
  return { target, name }
}

function normalizePath(p: string): string {
  return p.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function isInsideGitRepo(targetPath: string): boolean {
  try {
    let dir = resolve(targetPath)
    for (;;) {
      if (existsSync(join(dir, '.git'))) return true
      const parent = dirname(dir)
      if (parent === dir) return false
      dir = parent
    }
  } catch {
    return false
  }
}

function checkAvailability(repoPath: string): { available: boolean; unavailableReason?: string | undefined } {
  if (!existsSync(repoPath)) return { available: false, unavailableReason: '本地路径不存在' }
  if (!isInsideGitRepo(repoPath)) return { available: false, unavailableReason: '非 Git 仓库' }
  return { available: true }
}

export function resolveProjectMapPath(custom?: string): string | null {
  if (custom && existsSync(custom)) return custom

  const envMap = process.env.WORKBENCH_PROJECT_MAP
  if (envMap && existsSync(envMap)) return envMap

  const envVault = process.env.WORKBENCH_VAULT_PATH || process.env.VAULT_PATH
  if (envVault) {
    const cand = join(envVault, '项目.md')
    if (existsSync(cand)) return cand
  }

  // 尝试读取桌面端 prefs.json 中的 vaultPath
  const appData = process.env.APPDATA
  if (appData) {
    const prefsPath = join(appData, 'workbench-desktop', 'prefs.json')
    if (existsSync(prefsPath)) {
      try {
        const prefs = JSON.parse(readFileSync(prefsPath, 'utf8')) as { vaultPath?: string }
        if (prefs.vaultPath) {
          const cand = join(prefs.vaultPath, '项目.md')
          if (existsSync(cand)) return cand
        }
      } catch {
        // ignore error
      }
    }
  }

  // 常见默认路径
  const candidates = [
    'D:\\job\\notes\\项目.md',
    'D:\\job\\code\\notes\\AI-Workbench\\项目.md',
    join(process.cwd(), '项目.md'),
    join(process.cwd(), 'repo-map.md')
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }

  return null
}

export function parseProjectMap(markdown: string): { projects: ProjectItem[]; skipped: SkippedRow[] } {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((l) => SECTION_HEADING.test(l.trim()))
  if (start === -1) {
    return { projects: [], skipped: [{ line: 0, raw: '', reason: '未找到「## 已确认映射」章节' }] }
  }

  const projects: ProjectItem[] = []
  const skipped: SkippedRow[] = []
  const seen = new Set<string>()
  let tableRow = -1

  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i]!
    const line = raw.trim()
    if (ANY_SECTION_HEADING.test(line)) break
    if (!line.startsWith('|')) {
      if (tableRow >= 0) break
      continue
    }
    tableRow++
    if (tableRow === 0 || SEPARATOR_ROW.test(line)) continue

    const [linkCell = '', pathCell = '', typeCell = '', noteCell = ''] = splitRow(line)
    const link = parseWikilink(linkCell)
    if (!link) {
      skipped.push({ line: i + 1, raw, reason: '缺少 Obsidian 项目链接' })
      continue
    }

    const pathMatch = pathCell.match(/`([^`]+)`/)
    if (!pathMatch) {
      skipped.push({ line: i + 1, raw, reason: '缺少仓库路径' })
      continue
    }

    const repoPath = pathMatch[1]!.trim()
    const id = normalizePath(repoPath)
    if (seen.has(id)) {
      skipped.push({ line: i + 1, raw, reason: '重复的仓库路径，已合并' })
      continue
    }
    seen.add(id)

    const normalizedType = typeCell.replace(/\s+/g, '')
    const type = TYPE_MAP[normalizedType] ?? 'other'
    const availability = checkAvailability(repoPath)

    projects.push({
      id,
      name: link.name,
      obsidianLink: link.target,
      repoPath,
      type,
      typeLabel: typeCell.trim() || '其他',
      note: noteCell.trim(),
      available: availability.available,
      ...(availability.unavailableReason ? { unavailableReason: availability.unavailableReason } : {})
    })
  }

  return { projects, skipped }
}

export function renderProjectsMarkdown(projects: ProjectItem[], mapPath: string): string {
  const availableCount = projects.filter((p) => p.available).length
  const header = [
    `# 【项目仓库映射列表】(共 ${projects.length} 个项目，${availableCount} 个可用)`,
    `> 映射来源文件: \`${mapPath}\``,
    '',
    '| 项目名称 | 类型 | 本地代码路径 | 可用状态 | 说明 |',
    '| --- | --- | --- | --- | --- |'
  ]

  const rows = projects.map((p) => {
    const status = p.available ? '✅ 可用' : `❌ ${p.unavailableReason || '不可用'}`
    const note = p.note ? p.note.replace(/\|/g, '\\|') : '-'
    return `| **${p.name}** | ${p.typeLabel} | \`${p.repoPath}\` | ${status} | ${note} |`
  })

  return [...header, ...rows].join('\n')
}

export async function listProjects(options: {
  mapPath?: string | undefined
  query?: string | undefined
  type?: string | undefined
} = {}): Promise<ListProjectsResult> {
  const resolvedPath = resolveProjectMapPath(options.mapPath)
  if (!resolvedPath) {
    throw new AppError(
      'PROJECT_MAP_NOT_FOUND',
      '未找到项目映射文件「项目.md」，请通过参数 map_path 指定路径，或配置 WORKBENCH_VAULT_PATH 环境变量'
    )
  }

  let content: string
  try {
    content = readFileSync(resolvedPath, 'utf8')
  } catch (err) {
    throw new AppError('PROJECT_MAP_READ_FAILED', `读取项目映射文件失败: ${String(err)}`, resolvedPath)
  }

  const { projects } = parseProjectMap(content)
  const q = options.query?.trim().toLowerCase()
  const t = options.type?.trim().toLowerCase()

  const filtered = projects.filter((p) => {
    if (t && p.type !== t && !p.typeLabel.toLowerCase().includes(t)) return false
    if (q) {
      const matchName = p.name.toLowerCase().includes(q)
      const matchPath = p.repoPath.toLowerCase().includes(q)
      const matchNote = p.note.toLowerCase().includes(q)
      const matchType = p.typeLabel.toLowerCase().includes(q)
      return matchName || matchPath || matchNote || matchType
    }
    return true
  })

  const availableCount = filtered.filter((p) => p.available).length
  const markdown = renderProjectsMarkdown(filtered, resolvedPath)

  return {
    projects: filtered,
    total: filtered.length,
    availableCount,
    mapFilePath: resolvedPath,
    markdown
  }
}
