import { describe, expect, it } from 'vitest'
import type { TapdItem } from '../../shared/types'
import type { GitCommit } from '../git/gitService'
import { collectGit, multicaEntries, tapdEntries } from './sources'

const range = { start: '2026-10-17', end: '2026-10-23' }
const commit = (hash: string, subject: string, time = '2026-10-20T10:05:00+08:00'): GitCommit => ({ hash, time, subject, files: 2, insertions: 10, deletions: 3 })

describe('collectGit', () => {
  it('collects my commits per project, dedupes commits of projects sharing a repo and isolates failures', async () => {
    const calls: { repo: string; authors: string[] }[] = []
    const git = {
      async log(repo: string, opts: { since: string; until: string; authors: string[] }) {
        calls.push({ repo, authors: opts.authors })
        expect(opts).toMatchObject({ since: '2026-10-17', until: '2026-10-23' })
        if (repo === 'D:\\broken') throw new Error('不是 git 仓库')
        if (repo === 'D:\\mono\\a') return [commit('h1', 'feat: 分账'), commit('h2', 'fix: 共享')]
        if (repo === 'D:\\mono\\b') return [commit('h2', 'fix: 共享'), commit('h3', 'feat: b', '2026-10-21T09:00:00+08:00')]
        return []
      }
    }
    const result = await collectGit(
      git,
      [
        { name: '项目A', path: 'D:\\mono\\a' },
        { name: '项目B', path: 'D:\\mono\\b' },
        { name: '坏项目', path: 'D:\\broken' }
      ],
      range,
      ['chenzhiqiang']
    )
    expect(calls.every((c) => c.authors[0] === 'chenzhiqiang')).toBe(true)
    expect(result.entries.map((e) => [e.id, e.group, e.title])).toEqual([
      ['git:h3', '项目B', 'feat: b'],
      ['git:h1', '项目A', 'feat: 分账'],
      ['git:h2', '项目A', 'fix: 共享']
    ])
    expect(result.entries[1]).toMatchObject({ source: 'git', detail: '2 个文件 +10 -3', time: '2026-10-20 10:05' })
    expect(result.error).toBe('坏项目：不是 git 仓库')
  })
})

describe('tapdEntries', () => {
  it('maps TAPD items with kind, status and iteration', () => {
    const item = (extra: Partial<TapdItem & { done: boolean }>): TapdItem & { done: boolean } => ({
      key: 'story:1',
      kind: 'story',
      id: '1',
      workspaceId: '1',
      workspaceName: '多经项目',
      title: '分账失败原因',
      status: 'status_8',
      statusLabel: '已上线',
      iterationId: '9',
      iterationName: '10月迭代',
      owners: ['陈志强'],
      priority: null,
      modified: '2026-10-22 18:00:00',
      url: 'https://tapd/1',
      done: true,
      ...extra
    })
    expect(tapdEntries([item({}), item({ key: 'bug:2', kind: 'bug', id: '2', statusLabel: '新', iterationId: null, iterationName: null, done: false })])).toEqual([
      { id: 'tapd:story:1', source: 'tapd', group: '多经项目', title: '分账失败原因', detail: '需求 · 已上线（已完成） · 迭代：10月迭代', time: '2026-10-22 18:00', url: 'https://tapd/1' },
      { id: 'tapd:bug:2', source: 'tapd', group: '多经项目', title: '分账失败原因', detail: '缺陷 · 新', time: '2026-10-22 18:00', url: 'https://tapd/1' }
    ])
  })
})

describe('multicaEntries', () => {
  it('maps done issues with assignee and conclusion', () => {
    const base = {
      id: 'i1',
      identifier: 'JINB-1',
      title: '列表改造',
      status: 'done',
      assigneeType: 'agent' as const,
      assigneeId: 'a1',
      assigneeName: '前端开发',
      projectId: 'p1',
      projectTitle: '驴充充后台',
      repoId: null,
      updatedAt: '2026-10-20T02:05:00Z',
      url: 'https://multica.ai/jinbi/issues/JINB-1',
      tapdKey: null,
      conclusion: '已完成列表改造。'
    }
    const [a, b] = multicaEntries([base, { ...base, identifier: 'JINB-2', assigneeName: null, projectTitle: null, conclusion: null }])
    expect(a).toEqual({
      id: 'multica:JINB-1',
      source: 'multica',
      group: '驴充充后台',
      title: 'JINB-1 列表改造',
      detail: '执行：前端开发\n结论：已完成列表改造。',
      time: expect.stringMatching(/^2026-10-20 \d\d:05$/),
      url: base.url
    })
    expect(b).toMatchObject({ group: '未归属项目', detail: '执行：未指派' })
  })
})
