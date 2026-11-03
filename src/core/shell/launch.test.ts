import { describe, expect, it } from 'vitest'
import { shellProgram } from './launch'

describe('shell program', () => {
  it('uses PowerShell by default on Windows and supports bash/cmd', () => {
    if (process.platform !== 'win32') return
    expect(shellProgram()).toEqual({ file: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] })
    expect(shellProgram('cmd')).toEqual({ file: 'cmd.exe', args: [] })
    expect(shellProgram('bash').args).toEqual(['--login', '-i'])
  })
})
