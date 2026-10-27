import { readFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { ReportEntry, ReportRange } from '../../shared/types'
import { readFrontmatter, readSection } from '../markdown/sections'
import { TASKS_DIR, taskFiles } from '../tasks/taskCard'

const RESULT_MAX = 300
const PLACEHOLDER = '待填写。'

const inRange = (day: string, range: ReportRange) => day >= range.start && day <= range.end

/** vault 中 frontmatter `updated` 落在时间段内的任务卡，按更新时间倒序 */
export async function collectCards(vaultPath: string, range: ReportRange): Promise<ReportEntry[]> {
  const entries: ReportEntry[] = []
  for await (const file of taskFiles(join(vaultPath, TASKS_DIR))) {
    const md = await readFile(file, 'utf8')
    const fm = readFrontmatter(md)
    const updated = fm.updated ?? ''
    if (!inRange(updated.slice(0, 10), range)) continue
    const logs = (readSection(md, '执行记录') ?? '')
      .split(/\r?\n/)
      .map((l) => /^-\s+(.*)$/.exec(l)?.[1] ?? '')
      .filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l) && inRange(l.slice(0, 10), range))
    const result = readSection(md, '结果')
    const lines = [`状态：${fm.status ?? '未知'}`, ...logs]
    if (fm.status === 'done' && result && result !== PLACEHOLDER) lines.push(`结果：${result.replace(/\s+/g, ' ').slice(0, RESULT_MAX)}`)
    const rel = relative(vaultPath, file).split(sep).join('/')
    entries.push({
      id: `card:${rel}`,
      source: 'cards',
      group: fm.project || basename(dirname(file)),
      title: fm.title || basename(file, '.md'),
      detail: lines.join('\n'),
      time: updated.slice(0, 16)
    })
  }
  return entries.sort((a, b) => b.time.localeCompare(a.time))
}
