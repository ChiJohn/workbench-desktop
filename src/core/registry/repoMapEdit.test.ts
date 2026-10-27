import { describe, expect, it } from 'vitest'
import { AppError } from '../result'
import { addRow, removeRow, updateRow, writtenType } from './repoMapEdit'
import type { ProjectWriteRequest } from '../../shared/types'

const DOC = `---
type: repo-map
updated: 2026-10-01
---

# 项目

## 已确认映射

| 项目 | 代码仓库 | 类型 | 说明 |
| --- | --- | --- | --- |
| [[项目/甲/主页]] | \`D:\\code\\a\` | 小程序应用 | 甲的说明 |
| [[项目/乙/主页]] | \`D:\\code\\a\` | H5 应用 | 重复行 |
| [[项目/丙/主页]] | \`D:\\code\\c\` | 桌面应用 | 保留标签 |

## 使用约定

KEEP 这段不要动
`

const row = (patch: Partial<ProjectWriteRequest> = {}): ProjectWriteRequest => ({
  name: '丁',
  repoPath: 'D:\\code\\d',
  type: 'admin',
  note: '新说明',
  ...patch
})

function codeOf(fn: () => void): string {
  try {
    fn()
  } catch (e) {
    return e instanceof AppError ? e.code : 'OTHER'
  }
  return ''
}

describe('repoMapEdit', () => {
  it('appends a row and refreshes updated', () => {
    const next = addRow(DOC, row({ note: '一行\n两行 | 管道' }), '2026-10-26')
    expect(next).toContain('updated: 2026-10-26')
    expect(next).toContain('| [[项目/丁/主页]] | `D:\\code\\d` | 后台前端仓库 | 一行 两行 \\| 管道 |')
    expect(next).toContain('KEEP 这段不要动')
    expect(next).toContain('重复行')
  })

  it('rejects a duplicate path or name', () => {
    expect(codeOf(() => addRow(DOC, row({ repoPath: 'd:/code/c' }), '2026-10-26'))).toBe('PROJECT_EXISTS')
    expect(codeOf(() => addRow(DOC, row({ name: '甲' }), '2026-10-26'))).toBe('PROJECT_NAME_TAKEN')
    expect(codeOf(() => addRow(DOC, row({ name: 'a/b' }), '2026-10-26'))).toBe('PROJECT_NAME_INVALID')
    expect(codeOf(() => addRow('# 无表格', row(), '2026-10-26'))).toBe('MAP_NO_SECTION')
  })

  it('keeps an unknown type label when the type does not change', () => {
    expect(writtenType('other', '桌面应用')).toBe('桌面应用')
    expect(writtenType('miniapp', '桌面应用')).toBe('小程序应用')
    const next = updateRow(DOC, 'd:\\code\\c', row({ name: '丙', repoPath: 'D:\\code\\c', type: 'other', typeLabel: '桌面应用', note: '改了' }), '2026-10-26')
    expect(next).toContain('| [[项目/丙/主页]] | `D:\\code\\c` | 桌面应用 | 改了 |')
    expect(next).toContain('甲的说明')
  })

  it('replaces the first matching row', () => {
    const next = updateRow(DOC, 'd:\\code\\a', row({ name: '甲', repoPath: 'D:\\code\\a2', type: 'miniapp', typeLabel: '小程序应用', note: '改路径' }), '2026-10-26')
    expect(next).toContain('`D:\\code\\a2`')
    expect(next).toContain('重复行')
    expect(codeOf(() => updateRow(DOC, 'd:\\missing', row(), '2026-10-26'))).toBe('PROJECT_NOT_FOUND')
  })

  it('removes every row with the same path', () => {
    const next = removeRow(DOC, 'd:\\code\\a', '2026-10-26')
    expect(next).not.toContain('D:\\code\\a')
    expect(next).toContain('D:\\code\\c')
    expect(next).toContain('KEEP 这段不要动')
    expect(codeOf(() => removeRow(DOC, 'd:\\missing', '2026-10-26'))).toBe('PROJECT_NOT_FOUND')
  })
})
