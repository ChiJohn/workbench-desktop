import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildLaunchCommand } from './launchCommand'
import { ensureCommand, findMiniprogramRoot, runDetached } from './launcherService'

const base = { repoPath: 'D:\\job\\code\\hyx-h5', terminal: 'wt' as const }

describe('buildLaunchCommand', () => {
  it('builds commands for cursor, explorer and Windows Terminal', () => {
    expect(buildLaunchCommand('cursor', base)).toBe('cursor --classic "D:\\job\\code\\hyx-h5"')
    expect(buildLaunchCommand('explorer', base)).toBe('explorer "D:\\job\\code\\hyx-h5"')
    expect(buildLaunchCommand('terminal', base)).toBe('wt -d "D:\\job\\code\\hyx-h5"')
  })

  it('escapes single quotes for powershell', () => {
    const cmd = buildLaunchCommand('terminal', { repoPath: "D:\\it's", terminal: 'powershell' })
    expect(cmd).toBe(`start "" powershell -NoExit -Command "Set-Location -LiteralPath 'D:\\it''s'"`)
  })

  it('opens the mini program root with the devtools cli', () => {
    const cmd = buildLaunchCommand('wechat', {
      ...base,
      wechatDevtoolsCli: 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
      miniprogramRoot: 'D:\\job\\code\\mp\\dist'
    })
    expect(cmd).toBe(
      '"C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat" open --project "D:\\job\\code\\mp\\dist"'
    )
  })

  it('requires the devtools cli to be configured', () => {
    expect(() => buildLaunchCommand('wechat', base)).toThrow(
      expect.objectContaining({ code: 'WECHAT_CLI_NOT_CONFIGURED' })
    )
  })
})

describe('findMiniprogramRoot', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wb-mp-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('prefers the repo root', async () => {
    writeFileSync(join(dir, 'project.config.json'), '{}')
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'dist', 'project.config.json'), '{}')
    expect(await findMiniprogramRoot(dir)).toBe(dir)
  })

  it('finds a first-level sub directory, skipping node_modules', async () => {
    mkdirSync(join(dir, 'node_modules'))
    writeFileSync(join(dir, 'node_modules', 'project.config.json'), '{}')
    mkdirSync(join(dir, 'miniprogram'))
    writeFileSync(join(dir, 'miniprogram', 'project.config.json'), '{}')
    expect(await findMiniprogramRoot(dir)).toBe(join(dir, 'miniprogram'))
  })

  it('falls back to the repo root', async () => {
    expect(await findMiniprogramRoot(dir)).toBe(dir)
  })
})

describe('ensureCommand', () => {
  it('reports COMMAND_NOT_FOUND for commands missing from PATH', async () => {
    await expect(ensureCommand('definitely-not-a-command-xyz')).rejects.toMatchObject({
      code: 'COMMAND_NOT_FOUND',
      detail: 'definitely-not-a-command-xyz'
    })
  })

  it('resolves for commands on PATH', async () => {
    await expect(ensureCommand('git')).resolves.toBeUndefined()
  })
})

describe('runDetached', () => {
  it('resolves once the process has spawned', async () => {
    await expect(runDetached('exit 0')).resolves.toBeUndefined()
  })
})
