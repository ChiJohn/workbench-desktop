import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BranchList, RepoStatus, WorktreeChange } from '../../shared/types'
import { execCommand } from '../exec'
import { AppError } from '../result'
import { parseBranchList, parseLastCommit, parseStatusV2 } from './parseStatus'

const QUICK_TIMEOUT = 10_000
const SWITCH_TIMEOUT = 30_000
const NETWORK_TIMEOUT = 60_000
/** 提交可能触发 husky / lint-staged */
const COMMIT_TIMEOUT = 120_000
const DIFF_MAX_BYTES = 400_000

const GIT_ENV = {
  // 凭证缺失时直接失败，而不是卡住等待输入
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never'
}

/** `git status --porcelain=v1 -z`：重命名 / 复制条目后面紧跟一个原路径条目 */
export function parsePorcelainZ(out: string): WorktreeChange[] {
  const entries = out.split('\0')
  const result: WorktreeChange[] = []
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.length < 4) continue
    const code = e.slice(0, 2)
    result.push({ path: e.slice(3), code })
    if (code.includes('R') || code.includes('C')) i++
  }
  return result
}

function assertBranchName(name: string): void {
  if (!name.trim() || name.trim().startsWith('-')) {
    throw new AppError('INVALID_BRANCH', `非法的分支名：「${name}」`)
  }
}

export class GitService {
  constructor(private readonly gitBin = 'git') {}

  async status(repoPath: string): Promise<RepoStatus> {
    const [statusOut, logOut] = await Promise.all([
      this.run(repoPath, ['--no-optional-locks', 'status', '--porcelain=v2', '--branch'], QUICK_TIMEOUT),
      // 空仓库没有提交时 git log 会失败
      this.run(repoPath, ['log', '-1', '--format=%h%x00%s%x00%ct'], QUICK_TIMEOUT).catch((e) => {
        if (e instanceof AppError && e.code === 'GIT_FAILED') return ''
        throw e
      })
    ])
    return { ...parseStatusV2(statusOut), lastCommit: parseLastCommit(logOut) }
  }

  async fetch(repoPath: string): Promise<void> {
    await this.run(repoPath, ['fetch', '--prune'], NETWORK_TIMEOUT)
  }

  async pull(repoPath: string): Promise<void> {
    await this.run(repoPath, ['pull', '--ff-only'], NETWORK_TIMEOUT)
  }

  async branches(repoPath: string): Promise<BranchList> {
    const out = await this.run(repoPath, ['branch', '--format=%(HEAD)%00%(refname:short)'], QUICK_TIMEOUT)
    return parseBranchList(out)
  }

  /** 有未提交的已跟踪改动时拒绝切换：git switch 会把改动静默带到目标分支 */
  async checkout(repoPath: string, branch: string): Promise<void> {
    assertBranchName(branch)
    const dirty = await this.run(repoPath, ['status', '--porcelain', '--untracked-files=no'], QUICK_TIMEOUT)
    if (dirty.trim()) {
      const files = dirty.trim().split(/\r?\n/)
      throw new AppError(
        'DIRTY_WORKTREE',
        `有 ${files.length} 个未提交的改动，请先提交或贮藏后再切换分支`,
        dirty.trim()
      )
    }
    await this.run(repoPath, ['switch', branch.trim()], SWITCH_TIMEOUT)
  }

  async createBranch(repoPath: string, branch: string): Promise<void> {
    assertBranchName(branch)
    await this.run(repoPath, ['switch', '-c', branch.trim()], SWITCH_TIMEOUT)
  }

  /** 工作区改动（含未跟踪文件，逐个列出），路径为仓库内 / 分隔的相对路径 */
  async changes(repoPath: string): Promise<WorktreeChange[]> {
    const out = await this.run(repoPath, ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '-uall'], QUICK_TIMEOUT)
    return parsePorcelainZ(out)
  }

  async diff(repoPath: string, path: string): Promise<string> {
    const change = await this.requireChanged(repoPath, [path])
    if (change[0].code === '??') {
      const buf = await readFile(join(repoPath, path))
      if (buf.includes(0)) return `新文件 ${path}（二进制）`
      const text = buf.subarray(0, DIFF_MAX_BYTES).toString('utf8').replace(/\r\n/g, '\n').replace(/\n$/, '')
      return `新文件 ${path}\n${text.split('\n').map((l) => `+${l}`).join('\n')}`
    }
    const out = await this.run(repoPath, ['-c', 'core.quotepath=off', 'diff', 'HEAD', '--', path], QUICK_TIMEOUT).catch(
      () => this.run(repoPath, ['-c', 'core.quotepath=off', 'diff', '--cached', '--', path], QUICK_TIMEOUT)
    )
    return out.length > DIFF_MAX_BYTES ? `${out.slice(0, DIFF_MAX_BYTES)}\n…（diff 过长，已截断）` : out
  }

  /** 只提交选中的文件：commit 带路径时不会带上其他已暂存的改动 */
  async commitFiles(repoPath: string, files: string[], message: string): Promise<string> {
    if (!files.length) throw new AppError('INVALID_COMMIT', '没有选择要提交的文件')
    if (!message.trim()) throw new AppError('INVALID_COMMIT', '提交信息不能为空')
    await this.requireChanged(repoPath, files)
    await this.run(repoPath, ['add', '-A', '--', ...files], QUICK_TIMEOUT)
    await this.run(repoPath, ['commit', '-m', message.trim(), '--', ...files], COMMIT_TIMEOUT)
    return (await this.run(repoPath, ['rev-parse', '--short', 'HEAD'], QUICK_TIMEOUT)).trim()
  }

  private async requireChanged(repoPath: string, files: string[]): Promise<WorktreeChange[]> {
    const changes = await this.changes(repoPath)
    const byPath = new Map(changes.map((c) => [c.path, c]))
    const missing = files.filter((f) => !byPath.has(f))
    if (missing.length) throw new AppError('INVALID_PATH', `不在改动列表中：${missing.join('、')}`)
    return files.map((f) => byPath.get(f) as WorktreeChange)
  }

  private async run(repoPath: string, args: string[], timeoutMs: number): Promise<string> {
    const r = await execCommand(this.gitBin, args, {
      cwd: repoPath,
      timeoutMs,
      env: { ...process.env, ...GIT_ENV }
    })
    const verb = args.find((a) => !a.startsWith('-')) ?? args[0]
    if (r.timedOut) {
      throw new AppError('GIT_TIMEOUT', `git ${verb} 超时（${timeoutMs / 1000} 秒）`, r.stderr)
    }
    if (r.code !== 0) {
      const detail = (r.stderr || r.stdout).trim()
      const summary = detail.split(/\r?\n/).find((l) => l.trim()) ?? `git ${verb} 失败`
      throw new AppError('GIT_FAILED', summary, detail)
    }
    return r.stdout
  }
}
