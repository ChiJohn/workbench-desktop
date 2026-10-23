import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitService, parsePorcelainZ } from './gitService'

let repo: string
const git = new GitService()
const sh = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString()

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'wb-changes-'))
  sh('init', '-q', '-b', 'main')
  sh('config', 'user.email', 't@example.com')
  sh('config', 'user.name', 'tester')
  sh('config', 'commit.gpgsign', 'false')
  writeFileSync(join(repo, 'a.txt'), 'one\n')
  writeFileSync(join(repo, 'gone.txt'), 'bye\n')
  sh('add', '.')
  sh('commit', '-q', '-m', 'init')
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('parsePorcelainZ', () => {
  it('parses entries and skips the original path of renames', () => {
    expect(parsePorcelainZ(' M a.txt\0R  new.txt\0old.txt\0?? 中文 文件.txt\0')).toEqual([
      { path: 'a.txt', code: ' M' },
      { path: 'new.txt', code: 'R ' },
      { path: '中文 文件.txt', code: '??' }
    ])
  })
})

describe('GitService changes / diff / commitFiles', () => {
  it('lists modified, deleted and untracked files including nested ones', async () => {
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    unlinkSync(join(repo, 'gone.txt'))
    mkdirSync(join(repo, 'src', '页面'), { recursive: true })
    writeFileSync(join(repo, 'src', '页面', 'new.vue'), '<template/>\n')
    expect(await git.changes(repo)).toEqual([
      { path: 'a.txt', code: ' M' },
      { path: 'gone.txt', code: ' D' },
      { path: 'src/页面/new.vue', code: '??' }
    ])
  })

  it('diffs tracked files against HEAD and shows untracked files as additions', async () => {
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    writeFileSync(join(repo, 'b.txt'), 'x\ny\n')
    const tracked = await git.diff(repo, 'a.txt')
    expect(tracked).toContain('-one')
    expect(tracked).toContain('+two')
    expect(await git.diff(repo, 'b.txt')).toBe('新文件 b.txt\n+x\n+y')
  })

  it('refuses to diff or commit a path that is not changed', async () => {
    await expect(git.diff(repo, '../outside.txt')).rejects.toMatchObject({ code: 'INVALID_PATH' })
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    await expect(git.commitFiles(repo, ['a.txt', 'nope.txt'], 'msg')).rejects.toMatchObject({ code: 'INVALID_PATH' })
  })

  it('commits only the selected files, leaving other staged changes alone', async () => {
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    unlinkSync(join(repo, 'gone.txt'))
    writeFileSync(join(repo, 'new.txt'), 'n\n')
    writeFileSync(join(repo, 'other.txt'), 'o\n')
    sh('add', 'other.txt')
    const hash = await git.commitFiles(repo, ['a.txt', 'gone.txt', 'new.txt'], 'feat: 标题\n\nmultica: JINB-1')
    expect(hash).toMatch(/^[0-9a-f]{7,}$/)
    expect(sh('log', '-1', '--format=%B').trim()).toBe('feat: 标题\n\nmultica: JINB-1')
    expect(sh('show', '--name-status', '--format=', 'HEAD').trim().split(/\r?\n/).sort()).toEqual(['A\tnew.txt', 'D\tgone.txt', 'M\ta.txt'])
    expect(await git.changes(repo)).toEqual([{ path: 'other.txt', code: 'A ' }])
  })

  it('rejects an empty selection or message', async () => {
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    await expect(git.commitFiles(repo, [], 'msg')).rejects.toMatchObject({ code: 'INVALID_COMMIT' })
    await expect(git.commitFiles(repo, ['a.txt'], '  ')).rejects.toMatchObject({ code: 'INVALID_COMMIT' })
  })
})
