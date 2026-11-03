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

  it('refuses to switch branches with uncommitted tracked changes', async () => {
    const repo = join(root, 'repo')
    initRepo(repo)
    commit(repo, 'a.txt', 'init')
    await git.createBranch(repo, 'other')
    await git.checkout(repo, 'main')
    writeFileSync(join(repo, 'a.txt'), 'dirty')
    await expect(git.checkout(repo, 'other')).rejects.toMatchObject({ code: 'DIRTY_WORKTREE' })
    expect((await git.status(repo)).branch).toBe('main')
  })

  it('allows switching when only untracked files exist', async () => {
    const repo = join(root, 'repo')
    initRepo(repo)
    commit(repo, 'a.txt', 'init')
    await git.createBranch(repo, 'other')
    writeFileSync(join(repo, 'new.txt'), 'untracked')
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

  it('pushes the current branch to its upstream', async () => {
    const remote = join(root, 'remote.git')
    sh(root, 'init', '-q', '--bare', '-b', 'main', remote)
    const repo = join(root, 'repo')
    initRepo(repo)
    commit(repo, 'a.txt', 'init')
    sh(repo, 'remote', 'add', 'origin', remote)
    sh(repo, 'push', '-q', '-u', 'origin', 'main')
    commit(repo, 'b.txt', 'local')
    expect(await git.status(repo)).toMatchObject({ ahead: 1 })
    await git.push(repo)
    expect(await git.status(repo)).toMatchObject({ ahead: 0, behind: 0, lastCommit: expect.objectContaining({ subject: 'local' }) })
  })

  it('reads a file from a remote-tracking branch', async () => {
    const remote = join(root, 'remote.git')
    sh(root, 'init', '-q', '--bare', '-b', 'main', remote)
    const repo = join(root, 'repo')
    initRepo(repo)
    writeFileSync(join(repo, '.cnb.yml'), 'main:\n  api_trigger:\n    - stages: []\n')
    sh(repo, 'add', '.')
    sh(repo, 'commit', '-q', '-m', 'config')
    sh(repo, 'remote', 'add', 'origin', remote)
    sh(repo, 'push', '-q', '-u', 'origin', 'main')
    const shown = await git.showFile(repo, 'origin/main', '.cnb.yml')
    expect(shown).toMatchObject({ text: expect.stringContaining('api_trigger') })
    expect(await git.showFile(repo, 'origin/missing', '.cnb.yml')).toEqual({ missing: 'rev' })
  })

  it('pushes, lists, pops and drops stashes including untracked files', async () => {
    const repo = join(root, 'repo')
    initRepo(repo)
    commit(repo, 'a.txt', 'init')
    writeFileSync(join(repo, 'a.txt'), 'modified')
    writeFileSync(join(repo, 'new.txt'), 'untracked')

    await git.stashPush(repo, '临时切分支修bug')
    expect((await git.changes(repo)).length).toBe(0)

    const list = await git.stashes(repo)
    expect(list.length).toBe(1)
    expect(list[0]).toMatchObject({ index: 0, ref: 'stash@{0}' })
    expect(list[0].message).toContain('临时切分支修bug')

    await git.stashPop(repo, 0)
    expect((await git.stashes(repo)).length).toBe(0)
    expect((await git.changes(repo)).map((c) => c.path).sort()).toEqual(['a.txt', 'new.txt'])

    await git.stashPush(repo, '准备丢弃')
    await git.stashDrop(repo, 0)
    expect((await git.stashes(repo)).length).toBe(0)
  })

  it('previews diff and commits files when repoPath is a monorepo subdirectory', async () => {
    const repo = join(root, 'mono')
    initRepo(repo)
    const sub = join(repo, 'apps', 'travel')
    sh(repo, 'config', 'core.autocrlf', 'false')
    writeFileSync(join(repo, 'README.md'), 'root\n')
    sh(repo, 'add', '.')
    sh(repo, 'commit', '-q', '-m', 'init')

    const { mkdirSync } = await import('node:fs')
    mkdirSync(sub, { recursive: true })
    writeFileSync(join(sub, 'page.tsx'), 'export const v = 1\n')
    sh(repo, 'add', '.')
    sh(repo, 'commit', '-q', '-m', 'add travel')

    writeFileSync(join(sub, 'page.tsx'), 'export const v = 2\n')
    writeFileSync(join(sub, 'new.ts'), 'export const n = true\n')

    const changes = await git.changes(sub)
    expect(changes.map((c) => c.path).sort()).toEqual(['apps/travel/new.ts', 'apps/travel/page.tsx'])

    const trackedDiff = await git.diff(sub, 'apps/travel/page.tsx')
    expect(trackedDiff).toContain('+export const v = 2')

    const untrackedDiff = await git.diff(sub, 'apps/travel/new.ts')
    expect(untrackedDiff).toContain('+export const n = true')

    const hash = await git.commitFiles(sub, ['apps/travel/page.tsx', 'apps/travel/new.ts'], 'feat: 子目录提交')
    expect(hash).toMatch(/^[0-9a-f]+$/)
    expect((await git.changes(sub)).length).toBe(0)
  })
})
