import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BranchList, GitStashEntry, RepoStatus, WorktreeChange } from '../../shared/types'
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

export interface GitCommit {
  hash: string
  /** 作者时间 ISO */
  time: string
  subject: string
  files: number
  insertions: number
  deletions: number
}

/** `--format=%x1e%H%x1f%aI%x1f%s --shortstat` */
export function parseLog(out: string): GitCommit[] {
  return out
    .split('\x1e')
    .filter((r) => r.trim())
    .map((record) => {
      const [head, ...rest] = record.split('\n')
      const [hash, time, subject] = head.split('\x1f')
      const stat = rest.join('\n')
      const num = (re: RegExp) => Number(re.exec(stat)?.[1] ?? 0)
      return {
        hash,
        time,
        subject: subject ?? '',
        files: num(/(\d+) files? changed/),
        insertions: num(/(\d+) insertions?\(\+\)/),
        deletions: num(/(\d+) deletions?\(-\)/)
      }
    })
}

export function parseStashList(out: string): GitStashEntry[] {
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [ref = '', age = '', ...rest] = line.split('\0')
      const m = /stash@\{(\d+)\}/.exec(ref)
      return {
        index: m ? Number(m[1]) : 0,
        ref,
        age,
        message: rest.join('\0').trim()
      }
    })
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

  /** 推送当前分支到已有上游，不使用 --force */
  async push(repoPath: string): Promise<void> {
    await this.run(repoPath, ['push'], NETWORK_TIMEOUT)
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
    const root = await this.toplevel(repoPath)
    if (change[0].code === '??') {
      const buf = await readFile(join(root, path))
      if (buf.includes(0)) return `新文件 ${path}（二进制）`
      const text = buf.subarray(0, DIFF_MAX_BYTES).toString('utf8').replace(/\r\n/g, '\n').replace(/\n$/, '')
      return `新文件 ${path}\n${text.split('\n').map((l) => `+${l}`).join('\n')}`
    }
    let out = await this.run(root, ['-c', 'core.quotepath=off', 'diff', 'HEAD', '--', path], QUICK_TIMEOUT).catch(
      () => this.run(root, ['-c', 'core.quotepath=off', 'diff', '--cached', '--', path], QUICK_TIMEOUT)
    )
    if (!out.trim()) {
      out = await this.run(root, ['-c', 'core.quotepath=off', 'diff', '--', path], QUICK_TIMEOUT).catch(() => '')
    }
    return out.length > DIFF_MAX_BYTES ? `${out.slice(0, DIFF_MAX_BYTES)}\n…（diff 过长，已截断）` : out
  }

  /** 汇总选中文件的 diff 片段与最近提交标题，供 AI 生成 commit message（单次批量 git diff 避免逐文件起进程） */
  async commitMaterial(
    repoPath: string,
    files: string[],
    maxTotalChars = 4_500
  ): Promise<{ files: WorktreeChange[]; diff: string; recentSubjects: string[] }> {
    if (!files.length) throw new AppError('INVALID_COMMIT', '请先勾选要提交的文件')
    const [matched, root] = await Promise.all([this.requireChanged(repoPath, files), this.toplevel(repoPath)])
    const tracked = matched.filter((f) => f.code !== '??').map((f) => f.path)
    const untracked = matched.filter((f) => f.code === '??').map((f) => f.path)

    const [recentOut, trackedDiff] = await Promise.all([
      this.run(root, ['log', '-5', '--format=%s'], QUICK_TIMEOUT).catch(() => ''),
      tracked.length > 0
        ? this.run(root, ['-c', 'core.quotepath=off', 'diff', 'HEAD', '--unified=1', '--', ...tracked], QUICK_TIMEOUT).catch(
            () =>
              this.run(root, ['-c', 'core.quotepath=off', 'diff', '--cached', '--unified=1', '--', ...tracked], QUICK_TIMEOUT).catch(
                () => ''
              )
          )
        : Promise.resolve('')
    ])

    const recentSubjects = recentOut
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)

    const chunks: string[] = []
    if (trackedDiff.trim()) {
      chunks.push(
        trackedDiff.length > maxTotalChars
          ? `${trackedDiff.slice(0, maxTotalChars)}\n…（diff 已截断）`
          : trackedDiff.trim()
      )
    }

    // 未跟踪的新文件只读取前 3 个文件的头部摘要，避免读取大量文件拖慢速度
    for (const p of untracked.slice(0, 3)) {
      if (chunks.join('\n').length >= maxTotalChars) break
      const buf = await readFile(join(root, p)).catch(() => null)
      if (!buf || buf.includes(0)) continue
      const excerpt = buf.subarray(0, 500).toString('utf8').replace(/\r\n/g, '\n').trim()
      if (excerpt) chunks.push(`新文件 ${p}:\n${excerpt}`)
    }

    return {
      files: matched,
      diff: chunks.join('\n\n'),
      recentSubjects
    }
  }

  /** 只提交选中的文件：commit 带路径时不会带上其他已暂存的改动 */
  async commitFiles(repoPath: string, files: string[], message: string): Promise<string> {
    if (!files.length) throw new AppError('INVALID_COMMIT', '没有选择要提交的文件')
    if (!message.trim()) throw new AppError('INVALID_COMMIT', '提交信息不能为空')
    await this.requireChanged(repoPath, files)
    const root = await this.toplevel(repoPath)
    await this.run(root, ['add', '-A', '--', ...files], QUICK_TIMEOUT)
    await this.run(root, ['commit', '-m', message.trim(), '--', ...files], COMMIT_TIMEOUT)
    return (await this.run(root, ['rev-parse', '--short', 'HEAD'], QUICK_TIMEOUT)).trim()
  }

  async stashes(repoPath: string): Promise<GitStashEntry[]> {
    const out = await this.run(repoPath, ['stash', 'list', '--format=%gd%x00%cr%x00%gs'], QUICK_TIMEOUT)
    return parseStashList(out)
  }

  /** 贮藏全部本地改动（默认包含未跟踪文件 -u） */
  async stashPush(repoPath: string, message?: string): Promise<void> {
    const changes = await this.changes(repoPath)
    if (changes.length === 0) throw new AppError('STASH_EMPTY', '当前工作区没有可贮藏的改动')
    const args = ['stash', 'push', '-u']
    if (message?.trim()) args.push('-m', message.trim())
    await this.run(repoPath, args, SWITCH_TIMEOUT)
  }

  async stashPop(repoPath: string, index = 0): Promise<void> {
    if (!Number.isInteger(index) || index < 0) throw new AppError('INVALID_STASH', '无效的贮藏编号')
    await this.run(repoPath, ['stash', 'pop', `stash@{${index}}`], SWITCH_TIMEOUT)
  }

  async stashDrop(repoPath: string, index: number): Promise<void> {
    if (!Number.isInteger(index) || index < 0) throw new AppError('INVALID_STASH', '无效的贮藏编号')
    await this.run(repoPath, ['stash', 'drop', `stash@{${index}}`], QUICK_TIMEOUT)
  }

  async toplevel(repoPath: string): Promise<string> {
    return (await this.run(repoPath, ['rev-parse', '--show-toplevel'], QUICK_TIMEOUT)).trim()
  }

  /**
   * 所有引用上指定作者的提交（不含合并），日期为包含首尾的本地日期；
   * 在子目录下执行时只统计该目录内的改动
   */
  async log(repoPath: string, opts: { since: string; until: string; authors: string[] }): Promise<GitCommit[]> {
    if (!opts.authors.length) return []
    const out = await this.run(
      repoPath,
      [
        '-c',
        'core.quotepath=off',
        'log',
        '--all',
        '--no-merges',
        '--fixed-strings',
        `--since=${opts.since} 00:00:00`,
        `--until=${opts.until} 23:59:59`,
        ...opts.authors.map((a) => `--author=${a}`),
        '--format=%x1e%H%x1f%aI%x1f%s',
        '--shortstat',
        '--',
        '.'
      ],
      NETWORK_TIMEOUT
    ).catch((e) => {
      if (e instanceof AppError && e.code === 'GIT_FAILED' && /does not have any commits/.test(e.detail ?? '')) return ''
      throw e
    })
    return parseLog(out)
  }

  /** 读取某个提交上的文件。rev 不存在或该提交没有这个文件时用 missing 区分 */
  async showFile(repoPath: string, rev: string, file: string): Promise<{ text: string } | { missing: 'rev' | 'file' }> {
    if (!rev.trim() || rev.trim().startsWith('-') || rev.includes('..') || !file || file.startsWith('-')) {
      throw new AppError('INVALID_BRANCH', `不能读取这个版本上的文件：「${rev}」`)
    }
    try {
      await this.run(repoPath, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], QUICK_TIMEOUT)
    } catch (error) {
      if (error instanceof AppError && error.code === 'GIT_FAILED') return { missing: 'rev' }
      throw error
    }
    try {
      return { text: await this.run(repoPath, ['show', `${rev}:${file}`], QUICK_TIMEOUT) }
    } catch (error) {
      if (error instanceof AppError && error.code === 'GIT_FAILED') return { missing: 'file' }
      throw error
    }
  }

  async origin(repoPath: string): Promise<string | null> {
    try {
      const out = await this.run(repoPath, ['remote', 'get-url', 'origin'], QUICK_TIMEOUT)
      return out.trim() || null
    } catch {
      return null
    }
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
