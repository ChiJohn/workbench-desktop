import type { BranchList, LastCommit, RepoStatus } from '../../shared/types'

export type WorkingTreeStatus = Omit<RepoStatus, 'lastCommit'>

const CHANGE_PREFIXES = ['1 ', '2 ', 'u ', '? ']

/** 解析 `git status --porcelain=v2 --branch` 的输出 */
export function parseStatusV2(out: string): WorkingTreeStatus {
  const status: WorkingTreeStatus = { branch: null, upstream: null, ahead: 0, behind: 0, changes: 0 }
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length)
      status.branch = head === '(detached)' ? null : head
    } else if (line.startsWith('# branch.upstream ')) {
      status.upstream = line.slice('# branch.upstream '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/)
      if (m) {
        status.ahead = Number(m[1])
        status.behind = Number(m[2])
      }
    } else if (CHANGE_PREFIXES.some((p) => line.startsWith(p))) {
      status.changes++
    }
  }
  return status
}

/** 解析 `git log -1 --format=%h%x00%s%x00%ct` 的输出 */
export function parseLastCommit(out: string): LastCommit | null {
  const trimmed = out.replace(/\r?\n$/, '')
  if (!trimmed) return null
  const [hash, subject, seconds] = trimmed.split('\u0000')
  return { hash, subject, timestamp: Number(seconds) * 1000 }
}

/** 解析 `git branch --format=%(HEAD)%00%(refname:short)` 的输出 */
export function parseBranchList(out: string): BranchList {
  const result: BranchList = { current: null, local: [] }
  for (const line of out.split(/\r?\n/)) {
    if (!line) continue
    const [mark, name] = line.split('\u0000')
    if (!name || name.startsWith('(')) continue
    result.local.push(name)
    if (mark === '*') result.current = name
  }
  return result
}
