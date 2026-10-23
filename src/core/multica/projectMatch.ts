import type { MulticaProject } from '../../shared/types'

export interface RepoRef {
  id: string
  repoPath: string
  obsidianLink: string
}

export interface RawProject {
  id: string
  title: string
  description?: string | null
}

export type ProjectMatch = Pick<MulticaProject, 'repoId' | 'matchedBy'>

const normalize = (s: string) => s.replace(/\\/g, '/').toLowerCase()

/** 命中后紧跟的字符不能还是路径名的一部分，避免 `lvcc` 命中 `lvcc-manage-admin` */
function containsPath(text: string, path: string): boolean {
  let from = 0
  for (;;) {
    const at = text.indexOf(path, from)
    if (at < 0) return false
    const next = text[at + path.length]
    if (next === undefined || !/[\w.\-]/.test(next)) return true
    from = at + 1
  }
}

const folderName = (obsidianLink: string) => {
  const parts = obsidianLink.split('/').filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2] : (parts[0] ?? '')
}

/** 手工映射 > 描述中包含仓库路径（取最长）> 标题等于 vault 项目目录名 */
export function matchProjects(projects: RawProject[], repos: RepoRef[], manual: Record<string, string>): Map<string, ProjectMatch> {
  const known = new Set(repos.map((r) => r.id))
  const byLength = [...repos].sort((a, b) => b.repoPath.length - a.repoPath.length)
  const result = new Map<string, ProjectMatch>()
  for (const p of projects) {
    const manualId = manual[p.id]
    if (manualId) {
      result.set(p.id, known.has(manualId) ? { repoId: manualId, matchedBy: 'manual' } : { repoId: null, matchedBy: null })
      continue
    }
    const text = normalize(p.description ?? '')
    const byPath = byLength.find((r) => containsPath(text, normalize(r.repoPath).replace(/\/+$/, '')))
    if (byPath) {
      result.set(p.id, { repoId: byPath.id, matchedBy: 'path' })
      continue
    }
    const byName = repos.find((r) => folderName(r.obsidianLink) === p.title.trim())
    result.set(p.id, byName ? { repoId: byName.id, matchedBy: 'name' } : { repoId: null, matchedBy: null })
  }
  return result
}
