import { describe, expect, it } from 'vitest'
import { buildCliCommand } from './cliCommand'

const CLI = 'D:\\Program Files\\微信web开发者工具\\cli.bat'
const PROJECT = 'D:\\code\\app\\dist'

describe('buildCliCommand', () => {
  it('builds npm', () => {
    expect(buildCliCommand(CLI, { kind: 'build-npm', projectDir: PROJECT })).toBe(
      `"${CLI}" build-npm --project "${PROJECT}" --lang zh`
    )
  })

  it('previews to a base64 qr file', () => {
    expect(
      buildCliCommand(CLI, { kind: 'preview', projectDir: PROJECT, qrOutput: 'C:\\t\\qr.txt', infoOutput: 'C:\\t\\info.json' })
    ).toBe(
      `"${CLI}" preview --project "${PROJECT}" --qr-format base64 --qr-output "C:\\t\\qr.txt" --info-output "C:\\t\\info.json" --lang zh`
    )
  })

  it('uploads with version and sanitized description', () => {
    expect(
      buildCliCommand(CLI, {
        kind: 'upload',
        projectDir: PROJECT,
        version: '1.2.3',
        desc: 'fix "x" 100%',
        infoOutput: 'C:\\t\\info.json'
      })
    ).toBe(
      `"${CLI}" upload --project "${PROJECT}" -v "1.2.3" -d "fix 'x' 100％" --info-output "C:\\t\\info.json" --lang zh`
    )
  })

  it('rejects invalid versions', () => {
    expect(() =>
      buildCliCommand(CLI, { kind: 'upload', projectDir: PROJECT, version: '1.2', desc: 'd', infoOutput: 'i' })
    ).toThrow(expect.objectContaining({ code: 'INVALID_VERSION' }))
  })

  it('rejects an empty description', () => {
    expect(() =>
      buildCliCommand(CLI, { kind: 'upload', projectDir: PROJECT, version: '1.2.3', desc: '  ', infoOutput: 'i' })
    ).toThrow(expect.objectContaining({ code: 'INVALID_DESC' }))
  })

  it('rejects paths containing quotes', () => {
    expect(() => buildCliCommand(CLI, { kind: 'build-npm', projectDir: 'D:\\a"b' })).toThrow(
      expect.objectContaining({ code: 'INVALID_PATH' })
    )
  })
})
