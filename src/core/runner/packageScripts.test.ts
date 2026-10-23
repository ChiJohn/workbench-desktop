import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildRunCommand, detectPackageManager, readScripts } from './packageScripts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wb-pkg-'))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('detectPackageManager', () => {
  it('detects pnpm, yarn and falls back to npm', () => {
    expect(detectPackageManager(dir)).toBe('npm')
    writeFileSync(join(dir, 'yarn.lock'), '')
    expect(detectPackageManager(dir)).toBe('yarn')
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '')
    expect(detectPackageManager(dir)).toBe('pnpm')
  })
})

describe('readScripts', () => {
  it('returns an empty map when package.json is missing', async () => {
    expect(await readScripts(dir)).toEqual({ pm: 'npm', scripts: {} })
  })

  it('returns an empty map when package.json has no scripts', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"x"}')
    expect((await readScripts(dir)).scripts).toEqual({})
  })

  it('reads scripts', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', 'build:weapp': 'taro build' } }))
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '')
    expect(await readScripts(dir)).toEqual({ pm: 'pnpm', scripts: { dev: 'vite', 'build:weapp': 'taro build' } })
  })

  it('tolerates a UTF-8 BOM', async () => {
    writeFileSync(join(dir, 'package.json'), '\uFEFF{"scripts":{"dev":"vite"}}')
    expect((await readScripts(dir)).scripts).toEqual({ dev: 'vite' })
  })

  it('throws PACKAGE_JSON_INVALID for malformed json', async () => {
    writeFileSync(join(dir, 'package.json'), '{ nope')
    await expect(readScripts(dir)).rejects.toMatchObject({ code: 'PACKAGE_JSON_INVALID' })
  })
})

describe('buildRunCommand', () => {
  it('quotes the script name', () => {
    expect(buildRunCommand('pnpm', 'build:weapp')).toBe('pnpm run "build:weapp"')
  })

  it('rejects names that would break shell quoting', () => {
    expect(() => buildRunCommand('npm', 'a"b')).toThrow(expect.objectContaining({ code: 'INVALID_SCRIPT' }))
    expect(() => buildRunCommand('npm', '%PATH%')).toThrow(expect.objectContaining({ code: 'INVALID_SCRIPT' }))
  })
})
