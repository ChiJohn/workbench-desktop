import type { LastCommit, ReleaseEnv, ReleaseEnvOverride } from '../../shared/types'

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/
const DESC_MAX = 200

export function detectEnvs(
  scripts: Record<string, string>,
  overrides: Record<string, ReleaseEnvOverride> = {}
): ReleaseEnv[] {
  return Object.keys(scripts)
    .filter((name) => name.startsWith('build:weapp'))
    .map((script) => {
      const o = overrides[script] ?? {}
      return { script, label: o.label?.trim() || script, hidden: Boolean(o.hidden) }
    })
}

export function isValidVersion(version: string): boolean {
  return VERSION_RE.test(version)
}

export function bumpPatch(version: string): string | null {
  const m = VERSION_RE.exec(version)
  if (!m) return null
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

export function defaultVersion(lastUpload: string | undefined, pkgVersion: string | undefined): string {
  const bumped = lastUpload ? bumpPatch(lastUpload) : null
  if (bumped) return bumped
  if (pkgVersion && isValidVersion(pkgVersion)) return pkgVersion
  return '1.0.0'
}

/** 描述会放进 cmd 的双引号里：引号会提前结束参数，% 会触发变量展开 */
export function sanitizeDesc(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/%/g, '％')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, DESC_MAX)
}

export function defaultDesc(branch: string | null, commit: LastCommit | null): string {
  const parts = [branch ?? 'detached']
  if (commit) parts.push(commit.hash, commit.subject)
  return sanitizeDesc(parts.join(' '))
}
