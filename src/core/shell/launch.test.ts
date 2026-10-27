import { describe, expect, it } from 'vitest'
import { shellProgram } from './launch'

describe('shell program', () => {
  it('uses PowerShell on Windows', () => {
    if (process.platform !== 'win32') return
    expect(shellProgram()).toEqual({ file: 'powershell.exe', args: ['-NoLogo'] })
  })
})
