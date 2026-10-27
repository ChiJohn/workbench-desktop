import type { ReportKind, ReportRange, ReportSource } from './types'

export const REPORT_KIND_LABELS: Record<ReportKind, string> = { daily: '日报', weekly: '周报', monthly: '月报' }
export const REPORT_SOURCE_LABELS: Record<ReportSource, string> = { git: 'Git 提交', tapd: 'TAPD 单子', multica: 'multica 完成任务', cards: '任务卡' }

const pad = (n: number) => String(n).padStart(2, '0')

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 本地 `YYYY-MM-DD HH:mm` */
export function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** 日报当天；周报周六 ~ 周五；月报自然月 */
export function periodOf(kind: ReportKind, date: Date): ReportRange {
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (kind === 'daily') return { start: formatDate(today), end: formatDate(today) }
  if (kind === 'weekly') {
    const start = addDays(today, -((today.getDay() + 1) % 7))
    return { start: formatDate(start), end: formatDate(addDays(start, 6)) }
  }
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return { start: formatDate(first), end: formatDate(last) }
}

export function shiftPeriod(kind: ReportKind, range: ReportRange, delta: number): ReportRange {
  const start = parseDate(range.start)
  if (kind === 'daily') return periodOf(kind, addDays(start, delta))
  if (kind === 'weekly') return periodOf(kind, addDays(start, delta * 7))
  return periodOf(kind, new Date(start.getFullYear(), start.getMonth() + delta, 1))
}

/** vault 相对路径 */
export function reportPath(kind: ReportKind, range: ReportRange, name?: string): string {
  if (kind === 'daily') return `汇报/日报/${range.start}.md`
  if (kind === 'weekly') return `汇报/周报/${range.start}~${range.end}.md`
  const start = parseDate(range.start)
  return `汇报/月报/${start.getFullYear()}年${start.getMonth() + 1}月_月度工作总结${name ? `_${name}` : ''}.md`
}

export function noteKey(kind: ReportKind, range: ReportRange): string {
  return `${kind}:${range.start}`
}
