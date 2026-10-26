import type { ReportKind, ReportReminderPrefs } from '../../shared/types'

export const DEFAULT_REMINDER_TIMES: Record<ReportKind, string> = { daily: '18:30', weekly: '17:00', monthly: '17:00' }

const isWorkday = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5

function isLastWorkdayOfMonth(d: Date): boolean {
  if (!isWorkday(d)) return false
  for (let day = d.getDate() + 1; ; day++) {
    const next = new Date(d.getFullYear(), d.getMonth(), day)
    if (next.getMonth() !== d.getMonth()) return true
    if (isWorkday(next)) return false
  }
}

const minutesOf = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** 今天已到提醒时间的报告类型（是否已存在、是否已提醒由调用方过滤） */
export function dueReminders(now: Date, prefs: ReportReminderPrefs | undefined): ReportKind[] {
  if (prefs?.enabled === false) return []
  const applies: Record<ReportKind, boolean> = {
    daily: isWorkday(now),
    weekly: now.getDay() === 5,
    monthly: isLastWorkdayOfMonth(now)
  }
  const current = now.getHours() * 60 + now.getMinutes()
  return (['daily', 'weekly', 'monthly'] as const).filter((kind) => {
    const at = minutesOf(prefs?.[kind] || DEFAULT_REMINDER_TIMES[kind]) ?? minutesOf(DEFAULT_REMINDER_TIMES[kind])!
    return applies[kind] && current >= at
  })
}
