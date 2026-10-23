import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ExecOptions, ExecResult } from '../exec'
import { AppError } from '../result'
import { MulticaCli, resolveCliPath, resolveProfile } from './multicaCli'

const ENV = { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', USERPROFILE: 'C:\\Users\\me' }
const DESKTOP_CLI = 'C:\\Users\\me\\AppData\\Local\\Programs\\@multicadesktop\\resources\\app.asar.unpacked\\resources\\bin\\multica.exe'

interface Call {
  file: string
  args: string[]
  opts: ExecOptions
}

function fakeExec(result: Partial<ExecResult> | ((call: Call) => Partial<ExecResult>)) {
  const calls: Call[] = []
  const exec = async (file: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> => {
    const call = { file, args, opts }
    calls.push(call)
    const r = typeof result === 'function' ? result(call) : result
    return { code: 0, stdout: '', stderr: '', timedOut: false, ...r }
  }
  return { exec, calls }
}

function cli(exec: ReturnType<typeof fakeExec>['exec'], profile: string | null = 'desktop-api.multica.ai') {
  return new MulticaCli({ exec, resolveBin: () => 'multica.exe', resolveProfile: () => profile ?? undefined })
}

describe('resolveCliPath', () => {
  it('prefers a configured path that exists', () => {
    expect(resolveCliPath({ configured: 'D:\\m.exe', env: ENV, exists: (p) => p === 'D:\\m.exe' })).toBe('D:\\m.exe')
  })

  it('falls back to the CLI bundled with the desktop app', () => {
    expect(resolveCliPath({ configured: 'D:\\gone.exe', env: ENV, exists: (p) => p === DESKTOP_CLI })).toBe(DESKTOP_CLI)
  })

  it('falls back to multica on PATH', () => {
    expect(resolveCliPath({ env: ENV, exists: () => false })).toBe('multica')
  })
})

describe('resolveProfile', () => {
  it('uses the configured profile first', () => {
    expect(resolveProfile({ configured: 'dev', env: ENV, listDir: () => ['desktop-x'] })).toBe('dev')
  })

  it('picks the first desktop profile', () => {
    expect(resolveProfile({ env: ENV, listDir: () => ['staging', 'desktop-api.multica.ai'] })).toBe('desktop-api.multica.ai')
  })

  it('returns undefined when there is no desktop profile', () => {
    expect(resolveProfile({ env: ENV, listDir: () => [] })).toBeUndefined()
  })
})

describe('MulticaCli.json', () => {
  it('passes profile, workspace and json output, and parses stdout', async () => {
    const f = fakeExec({ stdout: '[{"id":"1"}]' })
    const out = await cli(f.exec).json(['issue', 'list'], { workspaceId: 'w1' })
    expect(out).toEqual([{ id: '1' }])
    expect(f.calls[0].file).toBe('multica.exe')
    expect(f.calls[0].args).toEqual(['--profile', 'desktop-api.multica.ai', '--workspace-id', 'w1', 'issue', 'list', '--output', 'json'])
  })

  it('omits --profile when none is resolved', async () => {
    const f = fakeExec({ stdout: '{}' })
    await cli(f.exec, null).json(['workspace', 'list'])
    expect(f.calls[0].args).toEqual(['workspace', 'list', '--output', 'json'])
  })

  it('returns null for empty output', async () => {
    expect(await cli(fakeExec({ stdout: '  \n' }).exec).json(['issue', 'status', 'X', 'done'])).toBeNull()
  })

  it.each([
    [{ code: 1, stderr: "No server configured. Run 'multica setup' first." }, 'MULTICA_NOT_LOGGED_IN'],
    [{ code: 4, stderr: 'The requested resource was not found. Check the ID' }, 'MULTICA_NOT_FOUND'],
    [{ code: null, timedOut: true }, 'MULTICA_TIMEOUT'],
    [{ code: 1, stderr: 'Error: invalid status "x"\nvalid: todo' }, 'MULTICA_ERROR'],
    [{ code: 0, stdout: 'not json' }, 'MULTICA_ERROR']
  ])('maps failures to error codes (%o)', async (result, code) => {
    await expect(cli(fakeExec(result).exec).json(['x'])).rejects.toMatchObject({ code })
  })

  it('uses the first stderr line as the message', async () => {
    await expect(cli(fakeExec({ code: 1, stderr: '\nError: invalid status "x"\nvalid: todo' }).exec).json(['x'])).rejects.toMatchObject({
      message: 'multica：Error: invalid status "x"'
    })
  })

  it('maps a missing executable to MULTICA_CLI_MISSING', async () => {
    const exec = async (): Promise<ExecResult> => {
      throw new AppError('COMMAND_NOT_FOUND', '找不到命令')
    }
    await expect(cli(exec).json(['x'])).rejects.toMatchObject({ code: 'MULTICA_CLI_MISSING' })
  })
})

describe('MulticaCli.withTempFile', () => {
  it('writes the content into a temp dir used as cwd and cleans up', async () => {
    let seen: { dir: string; content: string } | null = null
    const f = fakeExec((call) => {
      seen = { dir: call.opts.cwd as string, content: readFileSync(join(call.opts.cwd as string, 'body.md'), 'utf8') }
      return { stdout: '{"ok":true}' }
    })
    const c = cli(f.exec)
    const out = await c.withTempFile('中文\n内容', (name, cwd) => c.json(['issue', 'comment', 'add', 'X', '--content-file', name], { cwd }))
    expect(out).toEqual({ ok: true })
    expect(seen).not.toBeNull()
    expect(seen!.content).toBe('中文\n内容')
    expect(f.calls[0].args).toContain('body.md')
    expect(existsSync(seen!.dir)).toBe(false)
  })
})
