import { describe, expect, it } from 'vitest'
import { dueReminders } from './reminder'

const at = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min)
}

describe('dueReminders', () => {
  it('reminds the daily report on workdays after 18:30', () => {
    expect(dueReminders(at('2026-10-26', '18:29'), undefined)).toEqual([])
    expect(dueReminders(at('2026-10-26', '18:30'), undefined)).toEqual(['daily'])
    expect(dueReminders(at('2026-10-25', '20:00'), undefined)).toEqual([])
  })

  it('reminds the weekly report on Friday after 17:00', () => {
    expect(dueReminders(at('2026-10-23', '17:00'), undefined)).toEqual(['weekly'])
    expect(dueReminders(at('2026-10-23', '19:00'), undefined)).toEqual(['daily', 'weekly'])
  })

  it('reminds the monthly report on the last workday of the month', () => {
    expect(dueReminders(at('2026-10-30', '17:00'), undefined)).toEqual(['weekly', 'monthly'])
    expect(dueReminders(at('2026-10-29', '17:00'), undefined)).toEqual([])
    expect(dueReminders(at('2026-11-30', '17:00'), undefined)).toEqual(['monthly'])
  })

  it('follows custom times and the master switch', () => {
    expect(dueReminders(at('2026-10-26', '17:45'), { daily: '17:40' })).toEqual(['daily'])
    expect(dueReminders(at('2026-10-26', '18:40'), { daily: 'bad' })).toEqual(['daily'])
    expect(dueReminders(at('2026-10-30', '23:00'), { enabled: false })).toEqual([])
  })
})
