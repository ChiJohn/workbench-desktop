import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { parseCloneProgress, RepoClone, type CloneProcess } from './repoClone'

const exec = promisify(execFile)
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

function gitEnv() {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'wb',
    GIT_AUTHOR_EMAIL: 'wb@example.com',
    GIT_COMMITTER_NAME: 'wb',
    GIT_COMMITTER_EMAIL: 'wb@example.com'
  }
}

async function bareRepo(): Promise<{ root: string; remote: string }> {
  const root = await mkdtemp(join(tmpdir(), 'wb-clone-'))
  dirs.push(root)
  const src = join(root, 'src')
  await mkdir(src)
  await exec('git', ['init'], { cwd: src })
  await writeFile(join(src, 'readme.md'), 'hi')
  await exec('git', ['add', 'readme.md'], { cwd: src, env: gitEnv() })
  await exec('git', ['commit', '-m', 'init'], { cwd: src, env: gitEnv() })
  const remote = join(root, 'remote.git')
  await exec('git', ['clone', '--bare', src, remote])
  return { root, remote }
}

class FakeChild extends EventEmitter {
  pid = 42
  stdout = new EventEmitter()
  stderr = new EventEmitter()
}

describe('parseCloneProgress', () => {
  it('reads git progress lines', () => {
    expect(parseCloneProgress('Receiving objects: 45% (9/20)')).toMatchObject({ phase: 'receiving', percent: 45 })
    expect(parseCloneProgress('Resolving deltas: 100% (3/3)')).toMatchObject({ phase: 'resolving', percent: 100 })
    expect(parseCloneProgress('')).toBeNull()
  })
})

describe('RepoClone', () => {
  it('clones a local bare repository', async () => {
    const { root, remote } = await bareRepo()
    const dest = join(root, 'out')
    const lines: string[] = []
    await new RepoClone().clone(remote, dest, (p) => lines.push(p.line))
    expect(await readFile(join(dest, 'readme.md'), 'utf8')).toBe('hi')
    expect(lines.some((l) => l.includes('Cloning') || l.includes('%') || l.length > 0)).toBe(true)
  })

  it('refuses a non-empty destination without calling git', async () => {
    let spawned = false
    const clone = new RepoClone({
      spawn: () => {
        spawned = true
        return new FakeChild() as unknown as CloneProcess
      },
      list: async () => ['readme.md'],
      mkdir: async () => undefined,
      rm: async () => undefined,
      kill: async () => undefined
    })
    await expect(clone.clone('https://example.com/acme/app.git', 'D:\\out', () => undefined)).rejects.toMatchObject({
      code: 'CLONE_DEST_EXISTS'
    })
    expect(spawned).toBe(false)
  })

  it('deletes a directory it created when clone fails or is cancelled', async () => {
    const removed: string[] = []
    const fail = new RepoClone({
      spawn: () => {
        const child = new FakeChild()
        queueMicrotask(() => {
          child.stderr.emit('data', Buffer.from('fatal: Authentication failed\n'))
          child.emit('close', 128)
        })
        return child as unknown as CloneProcess
      },
      list: async () => null,
      mkdir: async () => undefined,
      rm: async (p) => {
        removed.push(p)
      },
      kill: async () => undefined
    })
    await expect(fail.clone('git@github.com:acme/app.git', 'D:\\new', () => undefined)).rejects.toMatchObject({ code: 'CLONE_AUTH' })
    expect(removed).toEqual(['D:\\new'])

    const child = new FakeChild()
    let spawned!: () => void
    const ready = new Promise<void>((resolve) => {
      spawned = resolve
    })
    const cancel = new RepoClone({
      spawn: () => {
        spawned()
        return child as unknown as CloneProcess
      },
      list: async () => null,
      mkdir: async () => undefined,
      rm: async (p) => {
        removed.push(`cancel:${p}`)
      },
      kill: async () => {
        child.emit('close', 1)
      }
    })
    const pending = cancel.clone('https://example.com/acme/app.git', 'D:\\gone', () => undefined)
    await ready
    await cancel.cancel()
    await expect(pending).rejects.toMatchObject({ code: 'CLONE_CANCELLED' })
    expect(removed).toContain('cancel:D:\\gone')
  })

  it('rejects a second clone while one is running', async () => {
    const child = new FakeChild()
    let spawned!: () => void
    const ready = new Promise<void>((resolve) => {
      spawned = resolve
    })
    const clone = new RepoClone({
      spawn: () => {
        spawned()
        return child as unknown as CloneProcess
      },
      list: async () => [],
      mkdir: async () => undefined,
      rm: async () => undefined,
      kill: async () => undefined
    })
    const first = clone.clone('https://example.com/acme/app.git', 'D:\\empty', () => undefined)
    await ready
    await expect(clone.clone('https://example.com/acme/app.git', 'D:\\empty', () => undefined)).rejects.toMatchObject({ code: 'CLONE_BUSY' })
    child.emit('close', 0)
    await first
  })
})
