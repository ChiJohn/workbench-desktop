import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '../util/result.js'

export type PackageManager = 'pnpm' | 'yarn' | 'npm'

export interface ScriptsInfo {
  pm: PackageManager
  scripts: Record<string, string>
  version?: string | undefined
}

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
    const pkg = JSON.parse(raw.replace(/^﻿/, '')) as { version?: string; scripts?: Record<string, string> }
    return { pm, scripts: pkg.scripts ?? {}, version: pkg.version }
  } catch (e) {
    throw new AppError('PACKAGE_JSON_INVALID', 'package.json 不是合法的 JSON', String(e))
  }
}
