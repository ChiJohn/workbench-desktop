import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveProjectDir } from './projectDir'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wb-pdir-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const writeConfig = (path: string, config: object) => {
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'project.config.json'), '\uFEFF' + JSON.stringify(config))
}

describe('resolveProjectDir', () => {
  it('uses the root for a native project', async () => {
    writeConfig(dir, { appid: 'wxroot' })
    expect(await resolveProjectDir(dir)).toEqual({ dir, appid: 'wxroot' })
  })

  it('prefers the build output when it has its own project.config.json', async () => {
    writeConfig(dir, { appid: 'wxroot', miniprogramRoot: 'dist/' })
    writeConfig(join(dir, 'dist'), { appid: 'wxdist', miniprogramRoot: './' })
    expect(await resolveProjectDir(dir)).toEqual({ dir: join(dir, 'dist'), appid: 'wxdist' })
  })

  it('falls back to the root before the first build', async () => {
    writeConfig(dir, { appid: 'wxroot', miniprogramRoot: 'dist/' })
    expect(await resolveProjectDir(dir)).toEqual({ dir, appid: 'wxroot' })
  })

  it('returns a null appid when missing', async () => {
    writeConfig(dir, {})
    expect((await resolveProjectDir(dir)).appid).toBeNull()
  })

  it('fails without project.config.json', async () => {
    await expect(resolveProjectDir(dir)).rejects.toMatchObject({ code: 'PROJECT_CONFIG_NOT_FOUND' })
  })
})
