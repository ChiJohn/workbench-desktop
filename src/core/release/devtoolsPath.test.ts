import { describe, expect, it } from 'vitest'
import { cliFromRegistryOutput, WECHAT_CLI_CANDIDATES } from './devtoolsPath'

describe('devtools path detection', () => {
  it('includes the default install folder without Tencent', () => {
    expect(WECHAT_CLI_CANDIDATES).toContain('D:\\Program Files\\微信web开发者工具\\cli.bat')
    expect(WECHAT_CLI_CANDIDATES).toContain('C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat')
  })

  it('derives cli.bat from uninstall and icon paths', () => {
    const output = [
      '"E:\\Tools\\wx dev\\卸载微信开发者工具.exe" /allusers',
      'E:\\Tools\\wx dev\\微信开发者工具.exe,0',
      ''
    ].join('\r\n')
    const seen: string[] = []
    const cli = cliFromRegistryOutput(output, (p) => {
      seen.push(p)
      return p === 'E:\\Tools\\wx dev\\cli.bat'
    })
    expect(seen[0]).toBe('E:\\Tools\\wx dev\\cli.bat')
    expect(cli).toBe('E:\\Tools\\wx dev\\cli.bat')
  })

  it('returns undefined when nothing exists', () => {
    expect(cliFromRegistryOutput('D:\\x\\a.exe', () => false)).toBeUndefined()
  })
})
