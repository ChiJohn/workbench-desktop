/** 集成终端要拉起的交互式 shell。Windows 用 PowerShell，其它系统用登录 shell。 */
export function shellProgram(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'] }
  const file = process.env.SHELL?.trim() || '/bin/bash'
  return { file, args: [] }
}
