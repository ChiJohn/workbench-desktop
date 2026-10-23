import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReleaseInfo, RepoPrefs, RepoStatus } from '../../shared/types'
import { readScripts } from '../runner/packageScripts'
import { resolveProjectDir } from './projectDir'
import { defaultDesc, defaultVersion, detectEnvs } from './releaseConfig'

async function readPackageVersion(dir: string): Promise<string | undefined> {
  try {
    const pkg = JSON.parse((await readFile(join(dir, 'package.json'), 'utf8')).replace(/^\uFEFF/, ''))
    return typeof pkg.version === 'string' ? pkg.version : undefined
  } catch {
    return undefined
  }
}

export async function buildReleaseInfo(input: {
  repoPath: string
  root: string
  repoPrefs: RepoPrefs
  status: RepoStatus | null
}): Promise<ReleaseInfo> {
  const { repoPath, root, repoPrefs, status } = input
  const [{ scripts }, projectDir, pkgVersion] = await Promise.all([
    readScripts(repoPath),
    resolveProjectDir(root).catch(() => null),
    readPackageVersion(repoPath)
  ])
  const envs = detectEnvs(scripts, repoPrefs.releaseEnvs)
  return {
    root,
    native: envs.length === 0,
    envs,
    appid: projectDir?.appid ?? null,
    defaultVersion: defaultVersion(repoPrefs.lastUploadVersion, pkgVersion),
    defaultDesc: defaultDesc(status?.branch ?? null, status?.lastCommit ?? null),
    branch: status?.branch ?? null,
    commit: status?.lastCommit ?? null,
    changes: status?.changes ?? 0
  }
}
