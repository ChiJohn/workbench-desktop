import { describe, expect, it } from 'vitest'
import { readFrontmatter, readSection, replaceSection } from './sections'

const DAILY = `佣金2.1.2
- [x] 页面

## 日报

旧内容

## 其他

保留
`

describe('sections', () => {
  it('reads a section body or null', () => {
    expect(readSection(DAILY, '日报')).toBe('旧内容')
    expect(readSection(DAILY, '不存在')).toBeNull()
  })

  it('replaces only the target section', () => {
    expect(replaceSection(DAILY, '日报', '### 今日完成\n\n- a\n')).toBe(
      '佣金2.1.2\n- [x] 页面\n\n## 日报\n\n### 今日完成\n\n- a\n\n## 其他\n\n保留\n'
    )
  })

  it('appends a missing section, or starts an empty document with it', () => {
    expect(replaceSection('# 笔记\n', '日报', 'x')).toBe('# 笔记\n\n## 日报\n\nx\n')
    expect(replaceSection('', '日报', 'x')).toBe('## 日报\n\nx\n')
  })

  it('handles CRLF headings', () => {
    expect(readSection('a\r\n\r\n## 日报\r\n\r\n内容\r\n', '日报')).toBe('内容')
  })

  it('reads simple frontmatter values without quotes', () => {
    expect(readFrontmatter("---\ntitle: 'It''s 标题'\nstatus: done\nupdated: 2026-10-24 07:38:59\n---\n# x")).toEqual({
      title: "It's 标题",
      status: 'done',
      updated: '2026-10-24 07:38:59'
    })
    expect(readFrontmatter('# none')).toEqual({})
  })
})
