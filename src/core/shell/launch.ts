import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ShellKind } from '../../shared/types'

function findGitBash(env: NodeJS.ProcessEnv = process.env): string {
  const candidates = [
    env.ProgramFiles && join(env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    env['ProgramFiles(x86)'] && join(env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'D:\\Program Files\\Git\\bin\\bash.exe'
  ].filter((p): p is string => Boolean(p))
  return candidates.find((p) => existsSync(p)) ?? 'bash.exe'
}

/** 集成终端要拉起的交互式 shell。Windows 支持 PowerShell / Git Bash / CMD，其它系统用登录 shell。 */
export function shellProgram(kind: ShellKind = 'powershell'): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    if (kind === 'bash') {
      return { file: findGitBash(), args: ['--login', '-i'] }
    }
    if (kind === 'cmd') {
      return { file: 'cmd.exe', args: [] }
    }
    // -NoProfile 避免 PSReadLine 抢走按键，否则 vim / agent 等 TUI 无法交互
    return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] }
  }
  const file = process.env.SHELL?.trim() || '/bin/bash'
  return { file, args: [] }
}
