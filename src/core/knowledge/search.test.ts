import { describe, expect, it } from 'vitest'
import { cleanSearch, parseSearchOutput, searchArgs } from './search'

describe('obsidian search', () => {
  it('builds a search:context command', () => {
    expect(searchArgs('AI-Workbench', '分账 失败原因', 30)).toEqual(['vault=AI-Workbench', 'search:context', 'query=分账 失败原因', 'format=json', 'limit=30'])
  })

  it('parses json and the no-match message', () => {
    expect(parseSearchOutput('No matches found.\n')).toEqual([])
    expect(parseSearchOutput('[{"file":"任务/a.md","matches":[{"line":2,"text":"失败原因"}]}]')).toEqual([{ file: '任务/a.md', matches: [{ line: 2, text: '失败原因' }] }])
  })

  it('drops reports and attachments, dedupes lines, truncates, and ranks knowledge first', () => {
    const long = '字'.repeat(250)
    const groups = cleanSearch(
      [
        { file: '汇报/周报/2026.md', matches: [{ line: 1, text: '失败原因' }] },
        { file: '附件/a.png', matches: [{ line: 1, text: '失败原因' }] },
        { file: '任务/a.md', matches: [{ line: 1, text: '失败原因' }, { line: 2, text: '失败原因' }, { line: 3, text: long }] },
        { file: '知识/驴充充后台.md', matches: [{ line: 4, text: '字段兼容' }] },
        { file: '问答/2026.md', matches: [{ line: 1, text: '以前的回答' }] }
      ],
      10
    )
    expect(groups.map((g) => g.file)).toEqual(['知识/驴充充后台.md', '任务/a.md', '问答/2026.md'])
    expect(groups[1].snippets).toEqual(['失败原因', `${'字'.repeat(200)}…`])
  })
})
