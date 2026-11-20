import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitService } from './gitService'

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
  repo = mkdtempSync(join(tmpdir(), 'wb-history-'))
  sh(['init', '-q', '-b', 'main'])
  sh(['config', 'user.email', 't@example.com'])
  sh(['config', 'user.name', 'tester'])
  sh(['config', 'commit.gpgsign', 'false'])
  commit('apps/a/one.txt', 'feat: 第一条', '2026-10-16T12:00:00')
  commit('apps/a/two.txt', 'feat: 子项目改动', '2026-10-19T10:00:00')
  commit('README.md', 'docs: 根目录', '2026-10-23T23:30:00', 'other <o@example.com>')
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('GitService.history', () => {
  it('pages the branch newest first and filters by author without leaving the branch', async () => {
    const page = await git.history(repo, { ref: 'main', limit: 2 })
    expect(page.commits.map((c) => c.subject)).toEqual(['docs: 根目录', 'feat: 子项目改动'])
    expect(page.commits[0]).toMatchObject({ author: 'other', short: expect.stringMatching(/^[0-9a-f]{7,}$/) })
    expect(page.hasMore).toBe(true)

    const rest = await git.history(repo, { ref: 'main', skip: 2, limit: 10 })
    expect(rest.commits.map((c) => c.subject)).toEqual(['feat: 第一条'])
    expect(rest.hasMore).toBe(false)

    const only = await git.history(repo, { ref: 'main', author: 'other', limit: 10 })
    expect(only.commits.map((c) => c.subject)).toEqual(['docs: 根目录'])
    expect(await git.status(repo)).toMatchObject({ branch: 'main' })
  })

  it('reads another branch and a subdirectory file without checking out', async () => {
    sh(['checkout', '-q', '-b', 'feature'])
    commit('apps/a/two.txt', 'feat: 功能分支', '2026-10-24T09:00:00')
    sh(['checkout', '-q', 'main'])
    sh(['update-ref', 'refs/remotes/origin/main', 'HEAD'])

    const feature = await git.history(repo, { ref: 'feature', limit: 1 })
    expect(feature.commits[0].subject).toBe('feat: 功能分支')
    expect(await git.status(repo)).toMatchObject({ branch: 'main' })

    const refs = await git.historyRefs(repo)
    expect(refs.local).toEqual(expect.arrayContaining(['main', 'feature']))
    expect(refs.remote).toContain('origin/main')

    const files = await git.listCommitFiles(join(repo, 'apps', 'a'), feature.commits[0].hash)
    expect(files).toEqual([{ status: 'M', path: 'two.txt' }])

    const fileLog = await git.history(join(repo, 'apps', 'a'), { ref: 'feature', path: 'two.txt', limit: 10 })
    expect(fileLog.commits.map((c) => c.subject)).toEqual(['feat: 功能分支', 'feat: 子项目改动'])

    const diff = await git.showFileDiff(join(repo, 'apps', 'a'), feature.commits[0].hash, 'two.txt')
    expect(diff).toContain('-feat: 子项目改动')
    expect(diff).toContain('+feat: 功能分支')
  })
})
