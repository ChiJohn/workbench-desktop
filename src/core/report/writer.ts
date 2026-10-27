import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { delimiter, dirname, join } from 'node:path'
import type { ReportWriter } from '../../shared/types'
import { AppError } from '../result'

export const WRITER_TIMEOUT_MS = 5 * 60_000
export const WRITER_LABELS: Record<ReportWriter, string> = { claude: 'Claude', cursor: 'cursor-agent', codex: 'Codex' }

export interface WriterCommand {
  writer: ReportWriter
  command: string
  args: string[]
  format: 'stream-json' | 'text'
}

export interface WriterFs {
  exists(path: string): boolean
  list(dir: string): string[]
}

const claudeArgs = (tools: string) => ['-p', '--output-format', 'stream-json', '--verbose', '--tools', tools, '--no-session-persistence']
const CLAUDE_EXE = join('node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')

function findClaude(custom: string | undefined, env: NodeJS.ProcessEnv, fs: WriterFs): string | null {
  if (custom) return fs.exists(custom) ? custom : null
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    if (fs.exists(join(dir, 'claude.exe'))) return join(dir, 'claude.exe')
    // npm 全局安装的 claude.cmd 会吞掉空字符串参数（--tools ""），直接用包里的 exe
    if (fs.exists(join(dir, 'claude.cmd')) && fs.exists(join(dir, CLAUDE_EXE))) return join(dir, CLAUDE_EXE)
  }
  return null
}

const versionKey = (name: string) => {
  const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})-[0-9a-f]+$/.exec(name)
  return m ? Number(m[1]) * 10_000 + Number(m[2]) * 100 + Number(m[3]) : null
}

/** custom 可以是 cursor-agent 安装目录（含 versions）或某个版本目录 */
function findCursorAgent(custom: string | undefined, env: NodeJS.ProcessEnv, fs: WriterFs): string | null {
  const root = custom || (env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'cursor-agent') : '')
  if (!root) return null
  const usable = (dir: string) => fs.exists(join(dir, 'node.exe')) && fs.exists(join(dir, 'index.js'))
  if (usable(root)) return root
  const versions = join(root, 'versions')
  if (!fs.exists(versions)) return null
  const latest = fs
    .list(versions)
    .map((name) => ({ name, key: versionKey(name) }))
    .filter((v): v is { name: string; key: number } => v.key !== null && usable(join(versions, v.name)))
    .sort((a, b) => b.key - a.key || b.name.localeCompare(a.name))[0]
  return latest ? join(versions, latest.name) : null
}

const CODEX_JS = join('node_modules', '@openai', 'codex', 'bin', 'codex.js')
const CODEX_ARGS = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only']

/** npm 全局安装只有 codex.cmd。Windows 上直接 spawn .cmd 会得到 EINVAL，改跑同目录的 node.exe */
function codexCommand(file: string, fs: WriterFs): { command: string; prefix: string[] } | null {
  if (!fs.exists(file)) return null
  const lower = file.toLowerCase()
  if (lower.endsWith('.exe')) return { command: file, prefix: [] }
  // codex.js 在 <prefix>/node_modules/@openai/codex/bin/；codex.cmd 就在 <prefix>
  const root = lower.endsWith('.js') ? dirname(dirname(dirname(dirname(dirname(file))))) : dirname(file)
  const js = lower.endsWith('.js') ? file : join(root, CODEX_JS)
  const node = join(root, 'node.exe')
  if (fs.exists(js) && fs.exists(node)) return { command: node, prefix: [js] }
  return null
}

function findCodex(custom: string | undefined, env: NodeJS.ProcessEnv, fs: WriterFs): { command: string; prefix: string[] } | null {
  if (custom) return codexCommand(custom.trim(), fs)
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    const exe = join(dir, 'codex.exe')
    if (fs.exists(exe)) return { command: exe, prefix: [] }
    const npm = codexCommand(join(dir, 'codex.cmd'), fs)
    if (npm) return npm
  }
  return null
}

export function resolveWriter(
  opts: { writer?: ReportWriter; claudePath?: string; cursorAgentPath?: string; codexPath?: string; workspace: string; profile?: 'report' | 'ask' },
  env: NodeJS.ProcessEnv,
  fs: WriterFs
): WriterCommand {
  const writer = opts.writer ?? 'claude'
  if (writer === 'claude') {
    const command = findClaude(opts.claudePath?.trim(), env, fs)
    if (!command) throw new AppError('REPORT_WRITER_MISSING', '找不到 Claude Code CLI（claude.exe），可在设置「汇报」中指定路径')
    return { writer, command, args: claudeArgs(opts.profile === 'ask' ? 'Read,Grep,Glob' : ''), format: 'stream-json' }
  }
  if (writer === 'codex') {
    const found = findCodex(opts.codexPath, env, fs)
    if (!found) throw new AppError('REPORT_WRITER_MISSING', '找不到 Codex CLI（codex.exe），可在设置「汇报」中指定路径')
    return { writer, command: found.command, args: [...found.prefix, ...CODEX_ARGS], format: 'text' }
  }
  const dir = findCursorAgent(opts.cursorAgentPath?.trim(), env, fs)
  if (!dir) throw new AppError('REPORT_WRITER_MISSING', '找不到 cursor-agent，可在设置「汇报」中指定安装目录')
  return {
    writer,
    command: join(dir, 'node.exe'),
    args: [join(dir, 'index.js'), '-p', '--output-format', 'text', '--mode', 'ask', '--trust', '--workspace', opts.workspace],
    format: 'text'
  }
}

/** 去掉首尾空白和整体包裹的 ```markdown 代码块 */
export function cleanOutput(text: string): string {
  const t = text.trim()
  const m = /^```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/.exec(t)
  return (m ? m[1] : t).trim()
}

const firstLine = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean) ?? ''

interface StreamEvent {
  type?: string
  subtype?: string
  attempt?: number
  max_retries?: number
  error_status?: number
  is_error?: boolean
  result?: string
}

export interface WriterDeps {
  spawn(command: string, args: string[], cwd: string): ChildProcessWithoutNullStreams
  kill(pid: number): Promise<void>
  timeoutMs?: number
  busyMessage?: string
}

/** 同一时间只跑一个写稿进程 */
export class ReportWriterRunner {
  private current: { child: ChildProcessWithoutNullStreams; stop(code: 'REPORT_CANCELLED'): void } | null = null

  constructor(private readonly deps: WriterDeps) {}

  get running(): boolean {
    return this.current !== null
  }

  run(cmd: WriterCommand, prompt: string, cwd: string, onProgress: (text: string) => void): Promise<string> {
    if (this.current) return Promise.reject(new AppError('REPORT_WRITER_BUSY', this.deps.busyMessage ?? '已有报告在生成'))
    const label = WRITER_LABELS[cmd.writer]
    return new Promise<string>((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = this.deps.spawn(cmd.command, cmd.args, cwd)
      } catch (e) {
        reject(new AppError('REPORT_WRITER_FAILED', `${label} 启动失败：${(e as Error).message}`))
        return
      }
      let stdout = ''
      let stderr = ''
      let buffer = ''
      let result: { ok: boolean; text: string } | null = null
      let stopped: 'REPORT_CANCELLED' | 'REPORT_WRITER_TIMEOUT' | null = null
      let settled = false

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.current = null
        fn()
      }
      const stop = (code: 'REPORT_CANCELLED' | 'REPORT_WRITER_TIMEOUT') => {
        if (stopped || settled) return
        stopped = code
        if (child.pid) void this.deps.kill(child.pid)
        finish(() =>
          reject(code === 'REPORT_CANCELLED' ? new AppError(code, '已取消生成') : new AppError(code, `${label} 超过 ${Math.round((this.deps.timeoutMs ?? WRITER_TIMEOUT_MS) / 60_000)} 分钟未完成`))
        )
      }
      const timer = setTimeout(() => stop('REPORT_WRITER_TIMEOUT'), this.deps.timeoutMs ?? WRITER_TIMEOUT_MS)
      this.current = { child, stop }

      const onLine = (line: string) => {
        if (!line.trim()) return
        let ev: StreamEvent
        try {
          ev = JSON.parse(line) as StreamEvent
        } catch {
          return
        }
        if (ev.type === 'system' && ev.subtype === 'init') onProgress(`${label} 已启动，等待模型输出…`)
        else if (ev.type === 'system' && ev.subtype === 'api_retry') onProgress(`接口返回 ${ev.error_status ?? '错误'}，第 ${ev.attempt}/${ev.max_retries} 次重试`)
        else if (ev.type === 'assistant') onProgress(`${label} 正在写稿…`)
        else if (ev.type === 'result') result = { ok: !ev.is_error && ev.subtype === 'success', text: ev.result ?? '' }
      }

      onProgress(`正在启动 ${label}…`)
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        if (cmd.format === 'text') {
          if (!stdout) onProgress(`${label} 正在写稿…`)
          stdout += chunk
          return
        }
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        lines.forEach(onLine)
      })
      child.stderr.on('data', (chunk: string) => (stderr += chunk))
      child.on('error', (e) => finish(() => reject(new AppError('REPORT_WRITER_FAILED', `${label} 启动失败：${e.message}`))))
      child.on('close', (code) => {
        if (stopped) return
        onLine(buffer)
        finish(() => {
          const r = result as { ok: boolean; text: string } | null
          const output = cmd.format === 'stream-json' ? r?.text ?? '' : stdout
          const failed = cmd.format === 'stream-json' && r ? !r.ok : code !== 0
          if (failed) {
            const message = (r ? firstLine(r.text) : '') || firstLine(stderr) || firstLine(stdout) || `退出码 ${code}`
            reject(new AppError('REPORT_WRITER_FAILED', `${label} 生成失败：${message}`, stderr.trim() || undefined))
            return
          }
          const text = cleanOutput(output)
          if (!text) reject(new AppError('REPORT_EMPTY', `${label} 没有返回内容`))
          else resolve(text)
        })
      })
      child.stdin.on('error', () => {})
      child.stdin.end(prompt, 'utf8')
    })
  }

  cancel(): void {
    this.current?.stop('REPORT_CANCELLED')
  }
}
