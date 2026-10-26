import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dailyBody, readReport, saveReport } from './reportFile'

let vault: string
beforeEach(() => (vault = mkdtempSync(join(tmpdir(), 'wb-report-'))))
afterEach(() => rmSync(vault, { recursive: true, force: true }))

const day = { start: '2026-10-26', end: '2026-10-26' }
const week = { start: '2026-10-17', end: '2026-10-23' }

describe('dailyBody', () => {
  it('drops a leading title and demotes headings that would end the section', () => {
    expect(dailyBody('# 2026-10-26 日报\n\n## 日报\n\n## 今日完成\n\n- a\n### 进行中\n')).toBe('### 今日完成\n\n- a\n### 进行中')
  })
})

describe('daily report', () => {
  it('creates the daily note with the section when it does not exist', async () => {
    expect(await saveReport(vault, 'daily', day, '### 今日完成\n\n- a')).toBe('Daily/2026-10-26.md')
    expect(readFileSync(join(vault, 'Daily', '2026-10-26.md'), 'utf8')).toBe('---\ndate: 2026-10-26\ntype: daily\n---\n\n# 2026-10-26\n\n## 日报\n\n### 今日完成\n\n- a\n')
    expect(await readReport(vault, 'daily', day)).toEqual({ path: 'Daily/2026-10-26.md', content: '### 今日完成\n\n- a' })
  })

  it('replaces only the 日报 section of an existing note', async () => {
    mkdirSync(join(vault, 'Daily'))
    const file = join(vault, 'Daily', '2026-10-26.md')
    writeFileSync(file, '# 2026-10-26\n\n## 今日记录\n\n- 手写\n')
    expect(await readReport(vault, 'daily', day)).toBeNull()
    await saveReport(vault, 'daily', day, '### 今日完成\n\n- 旧')
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n## 复盘\n\n- 问题：无\n`)
    await saveReport(vault, 'daily', day, '### 今日完成\n\n- 新')
    expect(readFileSync(file, 'utf8')).toBe('# 2026-10-26\n\n## 今日记录\n\n- 手写\n\n## 日报\n\n### 今日完成\n\n- 新\n\n## 复盘\n\n- 问题：无\n')
  })
})

describe('weekly and monthly report', () => {
  it('writes and reads the whole file', async () => {
    expect(await readReport(vault, 'weekly', week)).toBeNull()
    expect(await saveReport(vault, 'weekly', week, '\n# 工作周报\n')).toBe('周报/2026-10-17~2026-10-23.md')
    expect(await readReport(vault, 'weekly', week)).toEqual({ path: '周报/2026-10-17~2026-10-23.md', content: '# 工作周报\n' })
    expect(await saveReport(vault, 'monthly', { start: '2026-10-01', end: '2026-10-31' }, '# 月报', '陈志强')).toBe('月报/2026年10月_月度工作总结_陈志强.md')
  })
})
