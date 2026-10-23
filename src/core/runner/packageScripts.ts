import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PackageManager, ScriptsInfo } from '../../shared/types'
import { AppError } from '../result'

export function detectPackageManager(repoPath: string): PackageManager {
  if (existsSync(join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(repoPath, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

export async function readScripts(repoPath: string): Promise<ScriptsInfo> {
  const pm = detectPackageManager(repoPath)
  let raw: string
  try {
    raw = await readFile(join(repoPath, 'package.json'), 'utf8')
  } catch {
    return { pm, scripts: {} }
  }
  try {
    const pkg = JSON.parse(raw.replace(/^\uFEFF/, '')) as { scripts?: Record<string, string> }
    return { pm, scripts: pkg.scripts ?? {} }
  } catch (e) {
    throw new AppError('PACKAGE_JSON_INVALID', 'package.json 不是合法的 JSON', String(e))
  }
}

/** 脚本名会放进 cmd 的双引号里执行，引号和 % 会破坏转义 */
export function buildRunCommand(pm: PackageManager, script: string): string {
  if (/["%]/.test(script)) {
    throw new AppError('INVALID_SCRIPT', `脚本名包含不支持的字符：${script}`)
  }
  return `${pm} run "${script}"`
}
