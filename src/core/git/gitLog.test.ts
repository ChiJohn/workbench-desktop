import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitService, parseLog } from './gitService'

let repo: string
const git = new GitService()
const sh = (args: string[], env: Record<string, string> = {}) =>
  execFileSync('git', args, { cwd: repo, stdio: 'pipe', env: { ...process.env, ...env } }).toString()

function commit(file: string, message: string, date: string, author = 'chenzhiqiang <c@example.com>') {
  mkdirSync(join(repo, file, '..'), { recursive: true })
  writeFileSync(join(repo, file), `${message}\n`)
  sh(['add', '.'])
  sh(['commit', '-q', '-m', message, '--author', author], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date })
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'wb-log-'))
  sh(['init', '-q', '-b', 'main'])
  sh(['config', 'user.email', 't@example.com'])
  sh(['config', 'user.name', 'tester'])
  sh(['config', 'commit.gpgsign', 'false'])
  commit('apps/a/one.txt', 'feat: 早于时间段', '2026-10-16T12:00:00')
  commit('apps/a/two.txt', 'feat: 子项目改动', '2026-10-19T10:00:00')
  commit('apps/b/x.txt', 'fix: 另一个子项目', '2026-10-20T10:00:00')
  commit('apps/a/three.txt', 'chore: 别人的提交', '2026-10-21T10:00:00', 'other <o@example.com>')
  commit('README.md', 'docs: 根目录', '2026-10-23T23:30:00')
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('parseLog', () => {
  it('parses records with and without shortstat', () => {
    const out = '\x1eabc\x1f2026-10-19T10:00:00+08:00\x1ffeat: x\n\n 3 files changed, 20 insertions(+), 5 deletions(-)\n\x1edef\x1f2026-10-20T10:00:00+08:00\x1fmerge-ish\n'
    expect(parseLog(out)).toEqual([
      { hash: 'abc', time: '2026-10-19T10:00:00+08:00', subject: 'feat: x', files: 3, insertions: 20, deletions: 5 },
      { hash: 'def', time: '2026-10-20T10:00:00+08:00', subject: 'merge-ish', files: 0, insertions: 0, deletions: 0 }
    ])
  })
})

describe('GitService.log', () => {
  const range = { since: '2026-10-17', until: '2026-10-23' }

  it('filters by author and date range, newest first', async () => {
    const commits = await git.log(repo, { ...range, authors: ['chenzhiqiang'] })
    expect(commits.map((c) => c.subject)).toEqual(['docs: 根目录', 'fix: 另一个子项目', 'feat: 子项目改动'])
    expect(commits[2]).toMatchObject({ files: 1, insertions: 1, deletions: 0 })
  })

  it('only counts commits under a monorepo subdirectory', async () => {
    const commits = await git.log(join(repo, 'apps', 'a'), { ...range, authors: ['chenzhiqiang', 'other'] })
    expect(commits.map((c) => c.subject)).toEqual(['chore: 别人的提交', 'feat: 子项目改动'])
  })

  it('returns nothing without authors and resolves the repository root', async () => {
    expect(await git.log(repo, { ...range, authors: [] })).toEqual([])
    expect((await git.toplevel(join(repo, 'apps', 'b'))).replace(/\\/g, '/').toLowerCase()).toBe(repo.replace(/\\/g, '/').toLowerCase())
  })
})
