import { hasRepoPath, matchProjects, vaultFolderName, type RawProject, type RepoRef } from './projectMatch'

export const REPO_PATH_LABEL = '代码仓库目录：'

export interface ProjectSyncChange {
  repoId: string
  title: string
  projectId?: string
  description: string
}

export interface ProjectSyncPlan {
  create: ProjectSyncChange[]
  update: ProjectSyncChange[]
  unchanged: number
  unavailable: number
}

const MATCH_RANK = { manual: 0, path: 1, name: 2 }

/** 描述里已经有仓库路径时不改。有旧的「代码仓库目录」行就替换，否则追加。 */
export function descriptionWithRepoPath(description: string | null | undefined, repoPath: string): string | null {
  const text = (description ?? '').replace(/\r\n/g, '\n')
  if (hasRepoPath(text, repoPath)) return null
  const line = `${REPO_PATH_LABEL}${repoPath}`
  const lines = text.split('\n')
  const index = lines.findIndex((item) => item.trim().startsWith(REPO_PATH_LABEL))
  if (index >= 0) {
    lines[index] = line
    return lines.join('\n')
  }
  const trimmed = text.replace(/\s+$/, '')
  return trimmed ? `${trimmed}\n\n${line}` : line
}

function syncTitle(repo: RepoRef): string {
  return vaultFolderName(repo.obsidianLink) || repo.name?.trim() || repo.repoPath
}

/**
 * 工作台仓库 → multica 项目。
 * 没有对应项目就新建；对应上了但描述里没有仓库路径就补上。
 * 同一个 multica 项目只归给一个仓库。
 */
export function planProjectSync(projects: RawProject[], repos: RepoRef[], manual: Record<string, string>): ProjectSyncPlan {
  const matches = matchProjects(projects, repos, manual)
  const used = new Set<string>()
  const create: ProjectSyncChange[] = []
  const update: ProjectSyncChange[] = []
  let unchanged = 0
  let unavailable = 0
  const ordered = [...repos].sort((a, b) => a.id.localeCompare(b.id))
  for (const repo of ordered) {
    if (repo.available === false || !repo.repoPath.trim()) {
      unavailable += 1
      continue
    }
    const linked = projects
      .filter((project) => matches.get(project.id)?.repoId === repo.id && !used.has(project.id))
      .sort((a, b) => {
        const left = MATCH_RANK[matches.get(a.id)?.matchedBy ?? 'name']
        const right = MATCH_RANK[matches.get(b.id)?.matchedBy ?? 'name']
        return left - right || a.id.localeCompare(b.id)
      })
    const current = linked[0]
    if (!current) {
      create.push({ repoId: repo.id, title: syncTitle(repo), description: `${REPO_PATH_LABEL}${repo.repoPath}` })
      continue
    }
    used.add(current.id)
    const description = descriptionWithRepoPath(current.description, repo.repoPath)
    if (description === null) unchanged += 1
    else update.push({ repoId: repo.id, title: current.title, projectId: current.id, description })
  }
  return { create, update, unchanged, unavailable }
}
