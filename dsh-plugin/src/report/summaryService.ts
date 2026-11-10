import type { TapdHistoryItem } from '../types.js'
import type { TapdService } from '../tapd/tapdService.js'
import { collectGitCommits, type GitCommitRecord } from './gitHistory.js'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export interface WorkSummaryInput {
  since?: string | undefined
  until?: string | undefined
  repoPaths?: string[] | undefined
  authors?: string[] | undefined
  includeTapd?: boolean | undefined
}

export interface WorkSummaryResult {
  since: string
  until: string
  gitCommits: GitCommitRecord[]
  tapdItems: TapdHistoryItem[]
  summaryMarkdown: string
}

export async function collectWorkSummary(
  input: WorkSummaryInput,
  tapdService?: TapdService
): Promise<WorkSummaryResult> {
  const now = new Date()
  const until = input.until || formatDateStr(now)
  const since = input.since || formatDateStr(new Date(now.getTime() - 7 * 86400 * 1000))

  const repoPaths = (input.repoPaths && input.repoPaths.length > 0) ? input.repoPaths : [process.cwd()]
  const gitCommits = await collectGitCommits({
    repoPaths,
    since,
    until,
    authors: input.authors
  })

  let tapdItems: TapdHistoryItem[] = []
  if (input.includeTapd !== false && tapdService) {
    try {
      const res = await tapdService.history({ start: since, end: until })
      tapdItems = res.items
    } catch {
      // 未配置 TAPD 令牌或请求失败时容错跳过
    }
  }

  const lines: string[] = [
    `# 📅 工作总结素材 (${since} ~ ${until})`,
    ''
  ]

  if (tapdItems.length > 0) {
    const doneItems = tapdItems.filter((i) => i.done)
    const ongoingItems = tapdItems.filter((i) => !i.done)

    lines.push(`## 🎯 TAPD 研发事项（共 ${tapdItems.length} 项，已完成 ${doneItems.length} 项）`)
    if (doneItems.length > 0) {
      lines.push('### ✅ 已完成事项')
      for (const item of doneItems) {
        lines.push(`- [${item.key}] [${item.workspaceName}] [${item.statusLabel}] ${item.title} (${item.modified.slice(0, 10)})`)
      }
    }
    if (ongoingItems.length > 0) {
      lines.push('### ⏳ 进行中事项')
      for (const item of ongoingItems) {
        lines.push(`- [${item.key}] [${item.workspaceName}] [${item.statusLabel}] ${item.title}`)
      }
    }
    lines.push('')
  }

  lines.push(`## 💻 Git 提交记录（共 ${gitCommits.length} 次提交）`)
  if (gitCommits.length === 0) {
    lines.push('该时间段内暂无 Git 提交记录。')
  } else {
    for (const c of gitCommits) {
      lines.push(`- [\`${c.hash.slice(0, 7)}\`] (${c.repoName}) ${c.subject} (${c.time.slice(0, 10)})`)
    }
  }

  return {
    since,
    until,
    gitCommits,
    tapdItems,
    summaryMarkdown: lines.join('\n')
  }
}
