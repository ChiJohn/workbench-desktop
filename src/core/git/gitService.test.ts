import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitService } from './gitService'

let root: string
const git = new GitService()

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()

function initRepo(dir: string): void {
  sh(root, 'init', '-q', '-b', 'main', dir)
  sh(dir, 'config', 'user.email', 't@example.com')
  sh(dir, 'config', 'user.name', 'tester')
  sh(dir, 'config', 'commit.gpgsign', 'false')
}

function commit(dir: string, file: string, message: string): void {
  writeFileSync(join(dir, file), message)
  sh(dir, 'add', '.')
  sh(dir, 'commit', '-q', '-m', message)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wb-git-'))
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('GitService', () => {
  it('reports null lastCommit for an empty repository', async () => {
    const repo = join(root, 'empty')
    initRepo(repo)
    expect(await git.status(repo)).toEqual({
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      changes: 0,
      lastCommit: null
    })
  })

  it('reports changes and the last commit', async () => {
    const repo = join(root, 'repo')
    initRepo(repo)
    commit(repo, 'a.txt', 'feat: 初始化')
    writeFileSync(join(repo, 'a.txt'), 'changed')
    writeFileSync(join(repo, 'b.txt'), 'new')
    const status = await git.status(repo)
    expect(status.changes).toBe(2)
    expect(status.lastCommit).toMatchObject({ subject: 'feat: 初始化' })
    expect(status.lastCommit!.timestamp).toBeGreaterThan(Date.now() - 60_000)
  })

  it('creates, lists and switches branches', async () => {
    const repo = join(root, 'repo')
    initRepo(repo)
    commit(repo, 'a.txt', 'init')
    await git.createBranch(repo, 'feature/x')
    expect(await git.branches(repo)).toEqual({ current: 'feature/x', local: ['feature/x', 'main'] })
    await git.checkout(repo, 'main')
    expect((await git.status(repo)).branch).toBe('main')
  })

  it('rejects branch names that look like options', async () => {
    const repo = join(root, 'repo')
    initRepo(repo)
    await expect(git.createBranch(repo, '-D')).rejects.toMatchObject({ code: 'INVALID_BRANCH' })
    await expect(git.checkout(repo, '  ')).rejects.toMatchObject({ code: 'INVALID_BRANCH' })
  })

  it('surfaces git errors as GIT_FAILED with stderr detail', async () => {
    const repo = join(root, 'repo')
    initRepo(repo)
    commit(repo, 'a.txt', 'init')
    const err = await git.checkout(repo, 'does-not-exist').catch((e) => e)
    expect(err).toMatchObject({ code: 'GIT_FAILED' })
    expect(err.detail).toBeTruthy()
  })

  it('tracks ahead/behind against a remote and fast-forwards on pull', async () => {
    const remote = join(root, 'remote.git')
    sh(root, 'init', '-q', '--bare', '-b', 'main', remote)
    const a = join(root, 'a')
    const b = join(root, 'b')
    initRepo(a)
    commit(a, 'a.txt', 'init')
    sh(a, 'remote', 'add', 'origin', remote)
    sh(a, 'push', '-q', '-u', 'origin', 'main')
    sh(root, 'clone', '-q', remote, b)
    sh(b, 'config', 'user.email', 't@example.com')
    sh(b, 'config', 'user.name', 'tester')
    commit(b, 'b.txt', 'from b')
    sh(b, 'push', '-q')

    await git.fetch(a)
    expect(await git.status(a)).toMatchObject({ upstream: 'origin/main', ahead: 0, behind: 1 })
    await git.pull(a)
    expect(await git.status(a)).toMatchObject({ behind: 0, lastCommit: expect.objectContaining({ subject: 'from b' }) })
  })
})
