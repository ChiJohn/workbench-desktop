import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../result'
import { cleanOutput, ReportWriterRunner, resolveWriter, type WriterCommand } from './writer'

const fsOf = (files: string[], dirs: Record<string, string[]> = {}) => ({
  exists: (p: string) => files.includes(p) || p in dirs,
  list: (d: string) => dirs[d] ?? []
})

describe('resolveWriter', () => {
  it('uses the claude.exe inside the npm package next to claude.cmd on PATH', () => {
    const exe = join('D:\\nvm\\nodejs', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    const cmd = resolveWriter({ workspace: 'T' }, { PATH: 'C:\\Windows;D:\\nvm\\nodejs' }, fsOf([join('D:\\nvm\\nodejs', 'claude.cmd'), exe]))
    expect(cmd).toEqual({ writer: 'claude', command: exe, args: ['-p', '--output-format', 'stream-json', '--verbose', '--tools', '', '--no-session-persistence'], format: 'stream-json' })
  })

  it('picks the newest usable cursor-agent version', () => {
    const root = join('C:\\L', 'cursor-agent')
    const v = (name: string) => join(root, 'versions', name)
    const files = ['2026.10.19-6bbf2c4', '2026.9.30-aaaaaaa', '2026.10.22-27dcf5f'].flatMap((n) => [join(v(n), 'node.exe'), join(v(n), 'index.js')])
    const fs = fsOf(files, { [join(root, 'versions')]: ['2026.10.19-6bbf2c4', '2026.10.16-e3cb207.previous', '2026.9.30-aaaaaaa', '2026.10.22-27dcf5f', '2026.10.25-0000000', 'pending-launchers'] })
    const cmd = resolveWriter({ writer: 'cursor', workspace: 'T' }, { LOCALAPPDATA: 'C:\\L' }, fs)
    expect(cmd.command).toBe(join(v('2026.10.22-27dcf5f'), 'node.exe'))
    expect(cmd.args).toEqual([join(v('2026.10.22-27dcf5f'), 'index.js'), '-p', '--output-format', 'text', '--mode', 'ask', '--trust', '--workspace', 'T'])
  })

  it('opens read tools for an ask-profile claude', () => {
    const exe = join('D:\\nvm\\nodejs', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    const cmd = resolveWriter({ workspace: 'V', profile: 'ask' }, { PATH: 'D:\\nvm\\nodejs' }, fsOf([join('D:\\nvm\\nodejs', 'claude.cmd'), exe]))
    expect(cmd.args).toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--tools', 'Read,Grep,Glob', '--no-session-persistence'])
  })

  it('reports a missing writer', () => {
    expect(() => resolveWriter({ workspace: 'T' }, { PATH: 'C:\\x' }, fsOf([]))).toThrow(expect.objectContaining({ code: 'REPORT_WRITER_MISSING' }))
    expect(() => resolveWriter({ writer: 'claude', claudePath: 'D:\\nope.exe', workspace: 'T' }, {}, fsOf([]))).toThrow(AppError)
    expect(() => resolveWriter({ writer: 'cursor', workspace: 'T' }, {}, fsOf([]))).toThrow(expect.objectContaining({ code: 'REPORT_WRITER_MISSING' }))
    expect(() => resolveWriter({ writer: 'codex', workspace: 'T' }, { PATH: 'C:\\x' }, fsOf([]))).toThrow(expect.objectContaining({ code: 'REPORT_WRITER_MISSING' }))
  })

  it('starts Codex in a read-only sandbox and reads the prompt from stdin', () => {
    const cmd = resolveWriter({ writer: 'codex', workspace: 'T' }, { PATH: 'D:\\bin' }, fsOf([join('D:\\bin', 'codex.exe')]))
    expect(cmd).toEqual({ writer: 'codex', command: join('D:\\bin', 'codex.exe'), args: ['exec', '--skip-git-repo-check', '--sandbox', 'read-only'], format: 'text' })
    expect(cmd.args.join(' ')).not.toContain('full-auto')
    expect(cmd.args.join(' ')).not.toContain('workspace-write')
  })

  it('runs the npm Codex shim with node.exe instead of spawning codex.cmd', () => {
    const dir = join('D:\\nvm', 'nodejs')
    const js = join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    const cmd = resolveWriter({ writer: 'codex', workspace: 'T' }, { PATH: dir }, fsOf([join(dir, 'codex.cmd'), join(dir, 'node.exe'), js]))
    expect(cmd.command).toBe(join(dir, 'node.exe'))
    expect(cmd.args).toEqual([js, 'exec', '--skip-git-repo-check', '--sandbox', 'read-only'])
    expect(cmd.command.endsWith('.cmd')).toBe(false)
  })

  it('resolves a custom codex.js path back to the node prefix', () => {
    const dir = join('D:\\nvm', 'nodejs')
    const js = join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    const cmd = resolveWriter({ writer: 'codex', codexPath: js, workspace: 'T' }, {}, fsOf([js, join(dir, 'node.exe')]))
    expect(cmd.command).toBe(join(dir, 'node.exe'))
    expect(cmd.args[0]).toBe(js)
  })
})

describe('cleanOutput', () => {
  it('strips surrounding whitespace and an outer markdown fence', () => {
    expect(cleanOutput('\n```markdown\n# 周报\n\n- a\n```\n')).toBe('# 周报\n\n- a')
    expect(cleanOutput('  # 周报\n```js\nx\n```  ')).toBe('# 周报\n```js\nx\n```')
  })
})

function fakeChild() {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams
  const stdin = new PassThrough()
  let input = ''
  stdin.on('data', (c: Buffer) => (input += c.toString('utf8')))
  const out = new PassThrough()
  const err = new PassThrough()
  Object.assign(child, { stdin, stdout: out, stderr: err, pid: 42 })
  const close = (code: number) => setImmediate(() => child.emit('close', code))
  return { child, out, err, input: () => input, close }
}

const claude: WriterCommand = { writer: 'claude', command: 'claude.exe', args: [], format: 'stream-json' }
const cursor: WriterCommand = { writer: 'cursor', command: 'node.exe', args: ['index.js'], format: 'text' }

function runner(child: ChildProcessWithoutNullStreams, timeoutMs?: number) {
  const kill = vi.fn(async () => {})
  const spawn = vi.fn(() => child)
  return { r: new ReportWriterRunner({ spawn, kill, timeoutMs }), kill, spawn }
}

describe('ReportWriterRunner', () => {
  afterEach(() => vi.useRealTimers())

  it('feeds the prompt through stdin, reports retries and returns the stream-json result', async () => {
    const f = fakeChild()
    const { r, spawn } = runner(f.child)
    const progress: string[] = []
    const done = r.run(claude, '写周报', 'C:\\tmp\\w', (t) => progress.push(t))
    expect(r.running).toBe(true)
    f.out.write('{"type":"system","subtype":"init"}\n{"type":"system","subtype":"api_retry","attempt":1,"max_retries":10,"error_status":503}\n{"type":"assi')
    f.out.write('stant"}\n{"type":"result","subtype":"success","is_error":false,"result":"```markdown\\n# 周报\\n```"}')
    f.close(0)
    expect(await done).toBe('# 周报')
    expect(f.input()).toBe('写周报')
    expect(spawn).toHaveBeenCalledWith('claude.exe', [], 'C:\\tmp\\w')
    expect(progress).toEqual(['正在启动 Claude…', 'Claude 已启动，等待模型输出…', '接口返回 503，第 1/10 次重试', 'Claude 正在写稿…'])
    expect(r.running).toBe(false)
  })

  it('fails with the first line of an error result', async () => {
    const f = fakeChild()
    const { r } = runner(f.child)
    const done = r.run(claude, 'p', 'C:\\tmp', () => {})
    f.out.write('{"type":"result","subtype":"success","is_error":true,"result":"API Error: 503 upstream\\nmore"}\n')
    f.close(1)
    await expect(done).rejects.toMatchObject({ code: 'REPORT_WRITER_FAILED', message: 'Claude 生成失败：API Error: 503 upstream' })
  })

  it('returns plain text output and fails on a non-zero exit with stderr', async () => {
    const ok = fakeChild()
    const a = runner(ok.child)
    const done = a.r.run(cursor, 'p', 'C:\\tmp', () => {})
    ok.out.write('### 今日完成\n')
    ok.close(0)
    expect(await done).toBe('### 今日完成')

    const bad = fakeChild()
    const b = runner(bad.child)
    const failed = b.r.run(cursor, 'p', 'C:\\tmp', () => {})
    bad.err.write('\nError: not logged in\nstack')
    bad.close(1)
    await expect(failed).rejects.toMatchObject({ code: 'REPORT_WRITER_FAILED', message: 'cursor-agent 生成失败：Error: not logged in' })
  })

  it('rejects empty output and a second concurrent run', async () => {
    const f = fakeChild()
    const { r } = runner(f.child)
    const done = r.run(cursor, 'p', 'C:\\tmp', () => {})
    await expect(r.run(cursor, 'p', 'C:\\tmp', () => {})).rejects.toMatchObject({ code: 'REPORT_WRITER_BUSY' })
    f.out.write('  \n')
    f.close(0)
    await expect(done).rejects.toMatchObject({ code: 'REPORT_EMPTY' })
  })

  it('kills the process tree on cancel and on timeout', async () => {
    const f = fakeChild()
    const { r, kill } = runner(f.child)
    const done = r.run(claude, 'p', 'C:\\tmp', () => {})
    r.cancel()
    await expect(done).rejects.toMatchObject({ code: 'REPORT_CANCELLED' })
    expect(kill).toHaveBeenCalledWith(42)
    f.close(1)

    vi.useFakeTimers()
    const g = fakeChild()
    const t = runner(g.child, 1000)
    const timedOut = t.r.run(claude, 'p', 'C:\\tmp', () => {})
    vi.advanceTimersByTime(1000)
    await expect(timedOut).rejects.toMatchObject({ code: 'REPORT_WRITER_TIMEOUT' })
    expect(t.kill).toHaveBeenCalledWith(42)
    expect(t.r.running).toBe(false)
  })
})
