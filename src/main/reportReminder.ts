import { formatDate, periodOf } from '../shared/reportPeriod'
import type { ReportKind, ReportRange, ReportReminderPrefs } from '../shared/types'
import { dueReminders } from '../core/report/reminder'

const CHECK_INTERVAL_MS = 60_000
const FIRST_CHECK_MS = 15_000

export interface ReportReminderDeps {
  prefs(): ReportReminderPrefs | undefined
  exists(kind: ReportKind, range: ReportRange): Promise<boolean>
  notify(kind: ReportKind): void
}

/** 每分钟检查一次；同一类型一天最多提醒一次，报告已存在则不提醒 */
export class ReportReminder {
  private timers: NodeJS.Timeout[] = []
  private reminded: Partial<Record<ReportKind, string>> = {}
  private checking = false

  constructor(private readonly deps: ReportReminderDeps) {}

  start(): void {
    this.stop()
    this.timers.push(setTimeout(() => void this.check(), FIRST_CHECK_MS), setInterval(() => void this.check(), CHECK_INTERVAL_MS))
  }

  stop(): void {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  async check(now = new Date()): Promise<void> {
    if (this.checking) return
    this.checking = true
    try {
      const today = formatDate(now)
      for (const kind of dueReminders(now, this.deps.prefs())) {
        if (this.reminded[kind] === today) continue
        const exists = await this.deps.exists(kind, periodOf(kind, now)).catch(() => false)
        this.reminded[kind] = today
        if (!exists) this.deps.notify(kind)
      }
    } finally {
      this.checking = false
    }
  }
}
