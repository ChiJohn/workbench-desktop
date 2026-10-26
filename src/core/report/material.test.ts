import { describe, expect, it } from 'vitest'
import type { ReportEntry } from '../../shared/types'
import { buildPrompt, renderMaterial } from './material'

const entry = (source: ReportEntry['source'], group: string, title: string, time: string, detail?: string): ReportEntry => ({
  id: `${source}:${title}`,
  source,
  group,
  title,
  time,
  ...(detail && { detail })
})

describe('renderMaterial', () => {
  it('groups entries by source then project, oldest first, and appends manual notes', () => {
    const md = renderMaterial(
      [
        entry('tapd', '多经项目', '分账失败原因', '2026-10-22 18:00', '需求 · 已上线（已完成）'),
        entry('git', '驴充充后台', 'feat: b', '2026-10-21 09:00', '1 个文件 +1 -0'),
        entry('git', '支付中心', 'fix: c', '2026-10-20 11:00'),
        entry('git', '驴充充后台', 'feat: a', '2026-10-20 10:00', '2 个文件 +10 -3\n第二行')
      ],
      '  周三参加了需求评审  '
    )
    expect(md).toBe(
      [
        '## Git 提交',
        '',
        '### 驴充充后台',
        '',
        '- 2026-10-20 10:00 feat: a',
        '  2 个文件 +10 -3',
        '  第二行',
        '- 2026-10-21 09:00 feat: b',
        '  1 个文件 +1 -0',
        '',
        '### 支付中心',
        '',
        '- 2026-10-20 11:00 fix: c',
        '',
        '## TAPD 单子',
        '',
        '### 多经项目',
        '',
        '- 2026-10-22 18:00 分账失败原因',
        '  需求 · 已上线（已完成）',
        '',
        '## 手动补充',
        '',
        '周三参加了需求评审',
        ''
      ].join('\n')
    )
  })

  it('says so when there is no material', () => {
    expect(renderMaterial([], ' ')).toBe('（无素材）\n')
  })
})

describe('buildPrompt', () => {
  it('puts the instruction, template and material in order', () => {
    const prompt = buildPrompt('weekly', { start: '2026-10-17', end: '2026-10-23' }, '# 模板\n', '## Git 提交\n')
    expect(prompt.startsWith('你在帮我写周报，时间段 2026-10-17 ~ 2026-10-23。\n')).toBe(true)
    expect(prompt).toContain('\n\n===== 模板 =====\n\n# 模板\n\n===== 素材 =====\n\n## Git 提交\n')
  })
})
