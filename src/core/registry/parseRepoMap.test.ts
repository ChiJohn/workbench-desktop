import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseRepoMap } from './parseRepoMap'

const fixture = readFileSync(join(__dirname, '__fixtures__', 'repo-map.md'), 'utf8')

describe('parseRepoMap with the real repo map', () => {
  const { projects, skipped } = parseRepoMap(fixture)

  it('dedupes rows that point at the same repo', () => {
    expect(projects).toHaveLength(17)
    expect(skipped).toEqual([
      expect.objectContaining({ reason: expect.stringContaining('重复') })
    ])
  })

  it('takes the project name from the wikilink', () => {
    const p = projects.find((x) => x.repoPath === 'D:\\job\\code\\material-platform')
    expect(p).toMatchObject({
      id: 'd:\\job\\code\\material-platform',
      name: '恒优选后台',
      obsidianLink: 'Projects/恒优选后台/主页',
      type: 'admin',
      note: '恒优选后台管理端。'
    })
  })

  it('maps type labels', () => {
    const count = (t: string) => projects.filter((p) => p.type === t).length
    expect(count('miniapp')).toBe(5)
    expect(count('admin')).toBe(6)
    expect(count('h5')).toBe(3)
    expect(count('pc')).toBe(1)
    expect(count('cli')).toBe(1)
    expect(count('other')).toBe(1)
  })

  it('ignores the unmapped lists below the table', () => {
    expect(projects.some((p) => p.repoPath.includes('dev-workbench'))).toBe(false)
  })
})

describe('parseRepoMap edge cases', () => {
  const doc = (rows: string[]) =>
    [
      '# 仓库映射',
      '',
      '## 已确认映射',
      '',
      '| Obsidian 项目 | 代码仓库 | 类型 | 说明 |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
      '| 另一张表 | `D:\\other` | 小程序应用 | 不应解析 |'
    ].join('\r\n')

  it('handles an escaped pipe inside a wikilink alias', () => {
    const { projects } = parseRepoMap(doc(['| [[Projects/A/主页\\|别名]] | `D:\\a` | H5 应用 | x |']))
    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({ name: 'A', obsidianLink: 'Projects/A/主页', type: 'h5' })
  })

  it('falls back to the last path segment when the link is not a project homepage', () => {
    const { projects } = parseRepoMap(doc(['| [[Notes/Foo]] | `D:\\foo` | 前端仓库 | |']))
    expect(projects[0]).toMatchObject({ name: 'Foo', type: 'other', note: '' })
  })

  it('skips rows without a repo path or link, with 1-based line numbers', () => {
    const { projects, skipped } = parseRepoMap(
      doc(['| [[Projects/B/主页]] | 无 | H5 应用 | |', '| 纯文本 | `D:\\c` | H5 应用 | |'])
    )
    expect(projects).toHaveLength(0)
    expect(skipped).toEqual([
      { line: 7, raw: '| [[Projects/B/主页]] | 无 | H5 应用 | |', reason: '缺少仓库路径' },
      { line: 8, raw: '| 纯文本 | `D:\\c` | H5 应用 | |', reason: '缺少 Obsidian 项目链接' }
    ])
  })

  it('only parses the first table of the section', () => {
    const { projects } = parseRepoMap(doc(['| [[Projects/A/主页]] | `D:\\a` | H5 应用 | |']))
    expect(projects.map((p) => p.repoPath)).toEqual(['D:\\a'])
  })

  it('reports a missing section', () => {
    const { projects, skipped } = parseRepoMap('# 仓库映射\n\n没有表格')
    expect(projects).toEqual([])
    expect(skipped[0].reason).toContain('已确认映射')
  })
})
