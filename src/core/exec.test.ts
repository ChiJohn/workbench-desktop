import { describe, expect, it } from 'vitest'
import { execCommand } from './exec'
import { AppError } from './result'

describe('execCommand', () => {
  it('captures stdout and exit code 0', async () => {
    const r = await execCommand(process.execPath, ['-e', 'process.stdout.write("hello")'])
    expect(r).toMatchObject({ code: 0, stdout: 'hello', timedOut: false })
  })

  it('reports non-zero exit code and stderr without throwing', async () => {
    const r = await execCommand(process.execPath, ['-e', 'process.stderr.write("bad"); process.exit(3)'])
    expect(r.code).toBe(3)
    expect(r.stderr).toBe('bad')
  })

  it('throws COMMAND_NOT_FOUND for a missing binary', async () => {
    const err = await execCommand('definitely-not-a-real-binary-xyz', []).catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err.code).toBe('COMMAND_NOT_FOUND')
  })

  it('marks timedOut when the command exceeds the timeout', async () => {
    const r = await execCommand(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 200 })
    expect(r.timedOut).toBe(true)
  })
})
