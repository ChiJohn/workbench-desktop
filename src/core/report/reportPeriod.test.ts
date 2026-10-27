import { describe, expect, it } from 'vitest'
import { periodOf, reportPath, shiftPeriod } from '../../shared/reportPeriod'

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15, 30)

describe('periodOf', () => {
  it('uses the day itself for daily reports', () => {
    expect(periodOf('daily', day(2026, 10, 26))).toEqual({ start: '2026-10-26', end: '2026-10-26' })
  })

  it('uses Saturday to Friday for weekly reports', () => {
    expect(periodOf('weekly', day(2026, 10, 23))).toEqual({ start: '2026-10-17', end: '2026-10-23' })
    expect(periodOf('weekly', day(2026, 10, 24))).toEqual({ start: '2026-10-24', end: '2026-10-30' })
    expect(periodOf('weekly', day(2026, 10, 26))).toEqual({ start: '2026-10-24', end: '2026-10-30' })
  })

  it('uses the calendar month for monthly reports', () => {
    expect(periodOf('monthly', day(2026, 2, 10))).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(periodOf('monthly', day(2026, 12, 31))).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })
})

describe('shiftPeriod', () => {
  it('moves by one period of the same kind', () => {
    expect(shiftPeriod('daily', { start: '2026-11-01', end: '2026-11-01' }, -1)).toEqual({ start: '2026-10-31', end: '2026-10-31' })
    expect(shiftPeriod('weekly', { start: '2026-10-24', end: '2026-10-30' }, -1)).toEqual({ start: '2026-10-17', end: '2026-10-23' })
    expect(shiftPeriod('monthly', { start: '2026-12-01', end: '2026-12-31' }, 1)).toEqual({ start: '2027-01-01', end: '2027-01-31' })
  })
})

describe('reportPath', () => {
  it('follows the vault naming of each kind', () => {
    expect(reportPath('daily', { start: '2026-10-26', end: '2026-10-26' })).toBe('汇报/日报/2026-10-26.md')
    expect(reportPath('weekly', { start: '2026-10-17', end: '2026-10-23' })).toBe('汇报/周报/2026-10-17~2026-10-23.md')
    expect(reportPath('monthly', { start: '2026-09-01', end: '2026-09-30' }, '陈志强')).toBe('汇报/月报/2026年9月_月度工作总结_陈志强.md')
    expect(reportPath('monthly', { start: '2026-09-01', end: '2026-09-30' })).toBe('汇报/月报/2026年9月_月度工作总结.md')
  })
})
