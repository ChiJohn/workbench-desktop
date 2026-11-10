const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/
const DESC_MAX = 200

export function isValidVersion(version: string): boolean {
  return VERSION_RE.test(version)
}

export function bumpPatch(version: string): string | null {
  const m = VERSION_RE.exec(version)
  if (!m) return null
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

export function defaultVersion(lastUpload?: string, pkgVersion?: string): string {
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

export function defaultDesc(branch?: string | null, commitHash?: string | null, commitSubject?: string | null): string {
  const parts: string[] = [branch ?? 'main']
  if (commitHash) parts.push(commitHash.slice(0, 7))
  if (commitSubject) parts.push(commitSubject)
  return sanitizeDesc(parts.join(' '))
}

export function detectEnvs(scripts: Record<string, string>): { script: string; label: string }[] {
  return Object.keys(scripts)
    .filter((name) => name.startsWith('build:weapp') || name.startsWith('build:mp') || name.startsWith('build:wx'))
    .map((script) => ({ script, label: script }))
}

