import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execCommand } from '../exec'

const DIR_NAMES = ['微信web开发者工具', 'Tencent\\微信web开发者工具']

export const WECHAT_CLI_CANDIDATES = ['C:', 'D:', 'E:'].flatMap((drive) =>
  ['Program Files', 'Program Files (x86)'].flatMap((pf) => DIR_NAMES.map((d) => `${drive}\\${pf}\\${d}\\cli.bat`))
)

const UNINSTALL_KEYS = [
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
]

/** 输出 UninstallString / DisplayIcon，一行一个 */
const REGISTRY_SCRIPT = [
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
  `Get-ChildItem ${UNINSTALL_KEYS.map((k) => `'${k}'`).join(',')} -ErrorAction SilentlyContinue` +
    " | Get-ItemProperty | Where-Object { $_.DisplayName -like '微信*开发者工具*' }" +
    ' | ForEach-Object { $_.UninstallString; $_.DisplayIcon }'
].join(';')

/** 从卸载程序 / 图标路径推出安装目录下的 cli.bat */
export function cliFromRegistryOutput(output: string, exists: (p: string) => boolean = existsSync): string | undefined {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^"([^"]+)".*$/, '$1').replace(/,\d+$/, ''))
    .filter(Boolean)
    .map((file) => join(dirname(file), 'cli.bat'))
    .find((cli) => exists(cli))
}

export async function detectWechatCli(): Promise<string | undefined> {
  const found = WECHAT_CLI_CANDIDATES.find((p) => existsSync(p))
  if (found) return found
  try {
    const r = await execCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', REGISTRY_SCRIPT], {
      timeoutMs: 10_000
    })
    return r.code === 0 ? cliFromRegistryOutput(r.stdout) : undefined
  } catch {
    return undefined
  }
}
