import { execCommand } from '../util/exec.js'

export interface GitCommitRecord {
  hash: string
  time: string
  subject: string
  files: number
  insertions: number
  deletions: number
  repoName: string
}

export function parseGitLog(out: string, repoName: string): GitCommitRecord[] {
  return out
    .split('\x1e')
    .filter((r) => r.trim())
    .map((record) => {
      const parts = record.split('\n')
      const head = parts[0] ?? ''
      const rest = parts.slice(1)
      const [hash, time, subject] = head.split('\x1f')
      const stat = rest.join('\n')
      const num = (re: RegExp) => Number(re.exec(stat)?.[1] ?? 0)
      return {
        hash: (hash ?? '').trim(),
        time: (time ?? '').trim(),
        subject: (subject ?? '').trim(),
        files: num(/(\d+) files? changed/),
        insertions: num(/(\d+) insertions?\(\+\)/),
        deletions: num(/(\d+) deletions?\(-\)/),
        repoName
      }
    })
    .filter((c) => Boolean(c.hash))
}

export async function detectGitUser(cwd: string = process.cwd()): Promise<string | undefined> {
  try {
    const res = await execCommand('git', ['config', 'user.name'], { cwd, timeoutMs: 5000 })
    if (res.code === 0 && res.stdout.trim()) {
      return res.stdout.trim()
    }
    const globalRes = await execCommand('git', ['config', '--global', 'user.name'], { cwd, timeoutMs: 5000 })
    if (globalRes.code === 0 && globalRes.stdout.trim()) {
      return globalRes.stdout.trim()
    }
  } catch {
    // 忽略
  }
  return undefined
}

export interface CollectGitOptions {
  repoPaths: string[]
  since: string // YYYY-MM-DD
  until: string // YYYY-MM-DD
  authors?: string[] | undefined
}

export async function collectGitCommits(opts: CollectGitOptions): Promise<GitCommitRecord[]> {
  const authors = [...(opts.authors ?? [])]
  if (authors.length === 0) {
    const user = await detectGitUser(opts.repoPaths[0] || process.cwd())
    if (user) authors.push(user)
  }

  const allCommits: GitCommitRecord[] = []
  const seenHashes = new Set<string>()

  for (const repoPath of opts.repoPaths) {
    const repoName = repoPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'repo'
    const args = [
      '-c',
      'core.quotepath=off',
      'log',
      '--all',
      '--no-merges',
      '--fixed-strings',
      `--since=${opts.since} 00:00:00`,
      `--until=${opts.until} 23:59:59`
    ]
    if (authors.length > 0) {
      for (const a of authors) {
        args.push(`--author=${a}`)
      }
    }
    args.push('--format=%x1e%H%x1f%aI%x1f%s', '--shortstat', '--', '.')

    try {
      const res = await execCommand('git', args, { cwd: repoPath, timeoutMs: 30_000 })
      if (res.code === 0 && res.stdout) {
        const commits = parseGitLog(res.stdout, repoName)
        for (const c of commits) {
          if (!seenHashes.has(c.hash)) {
            seenHashes.add(c.hash)
            allCommits.push(c)
          }
        }
      }
    } catch {
      // 容错跳过非 git 目录或读取失败的项目
    }
  }

  return allCommits.sort((a, b) => b.time.localeCompare(a.time))
}
