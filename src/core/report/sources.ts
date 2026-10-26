import { formatDateTime } from '../../shared/reportPeriod'
import type { ReportEntry, ReportRange, ReportSourceResult, TapdKind } from '../../shared/types'
import { mapLimit } from '../concurrency'
import type { GitCommit } from '../git/gitService'
import type { MulticaDoneIssue } from '../multica/multicaService'
import { toErrorInfo } from '../result'
import type { TapdHistoryItem } from '../tapd/tapdService'

const GIT_CONCURRENCY = 4
const KIND_LABELS: Record<TapdKind, string> = { story: '需求', bug: '缺陷', task: '任务' }

export interface GitLogLike {
  log(repoPath: string, opts: { since: string; until: string; authors: string[] }): Promise<GitCommit[]>
}

const byTimeDesc = (a: ReportEntry, b: ReportEntry) => b.time.localeCompare(a.time)

/** 同一提交出现在共用仓库的多个项目里时只算一次，归到列表里靠前的项目 */
export async function collectGit(git: GitLogLike, repos: { name: string; path: string }[], range: ReportRange, authors: string[]): Promise<ReportSourceResult> {
  const results = await mapLimit(repos, GIT_CONCURRENCY, async (repo) => {
    try {
      return { repo, commits: await git.log(repo.path, { since: range.start, until: range.end, authors }) }
    } catch (e) {
      return { repo, error: `${repo.name}：${toErrorInfo(e).message}` }
    }
  })
  const seen = new Set<string>()
  const entries: ReportEntry[] = []
  for (const { repo, commits = [] } of results) {
    for (const c of commits) {
      if (seen.has(c.hash)) continue
      seen.add(c.hash)
      entries.push({
        id: `git:${c.hash}`,
        source: 'git',
        group: repo.name,
        title: c.subject,
        detail: `${c.files} 个文件 +${c.insertions} -${c.deletions}`,
        time: formatDateTime(new Date(c.time))
      })
    }
  }
  const errors = results.flatMap((r) => (r.error ? [r.error] : []))
  return { source: 'git', entries: entries.sort(byTimeDesc), ...(errors.length && { error: errors.join('；') }) }
}

export function tapdEntries(items: TapdHistoryItem[]): ReportEntry[] {
  return items.map((i) => ({
    id: `tapd:${i.key}`,
    source: 'tapd',
    group: i.workspaceName,
    title: i.title,
    detail: [KIND_LABELS[i.kind], `${i.statusLabel}${i.done ? '（已完成）' : ''}`, ...(i.iterationName ? [`迭代：${i.iterationName}`] : [])].join(' · '),
    time: i.modified.slice(0, 16),
    url: i.url
  }))
}

export function multicaEntries(issues: MulticaDoneIssue[]): ReportEntry[] {
  return issues.map((i) => ({
    id: `multica:${i.identifier}`,
    source: 'multica',
    group: i.projectTitle ?? '未归属项目',
    title: `${i.identifier} ${i.title}`,
    detail: [`执行：${i.assigneeName ?? '未指派'}`, ...(i.conclusion ? [`结论：${i.conclusion}`] : [])].join('\n'),
    time: formatDateTime(new Date(i.updatedAt)),
    url: i.url
  }))
}
