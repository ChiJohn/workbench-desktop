import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RegistryService } from './registryService'

let vault: string
let repos: string
let service: RegistryService

const writeMap = (rows: string[]) =>
  writeFileSync(
    join(vault, 'Projects', '仓库映射.md'),
    ['## 已确认映射', '', '| 项目 | 仓库 | 类型 | 说明 |', '|---|---|---|---|', ...rows].join('\n')
  )

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'wb-vault-'))
  repos = mkdtempSync(join(tmpdir(), 'wb-repos-'))
  mkdirSync(join(vault, 'Projects'))
  mkdirSync(join(repos, 'good', '.git'), { recursive: true })
  mkdirSync(join(repos, 'plain'))
  service = new RegistryService(() => vault, 50)
})

afterEach(() => {
  service.unwatch()
  rmSync(vault, { recursive: true, force: true })
  rmSync(repos, { recursive: true, force: true })
})

describe('RegistryService', () => {
  it('throws MAP_NOT_FOUND when the map file is missing', async () => {
    await expect(service.load()).rejects.toMatchObject({ code: 'MAP_NOT_FOUND' })
  })

  it('marks projects unavailable when the path is missing or not a git repo', async () => {
    writeMap([
      `| [[Projects/Good/主页]] | \`${join(repos, 'good')}\` | H5 应用 | |`,
      `| [[Projects/Plain/主页]] | \`${join(repos, 'plain')}\` | H5 应用 | |`,
      `| [[Projects/Gone/主页]] | \`${join(repos, 'gone')}\` | H5 应用 | |`
    ])
    const { projects, sourcePath } = await service.load()
    expect(sourcePath).toBe(join(vault, 'Projects', '仓库映射.md'))
    expect(projects.map((p) => [p.name, p.available, p.unavailableReason])).toEqual([
      ['Good', true, undefined],
      ['Plain', false, '不在 git 仓库中'],
      ['Gone', false, '路径不存在']
    ])
  })

  it('treats a sub directory of a git repo (monorepo app) as available', async () => {
    mkdirSync(join(repos, 'good', 'apps', 'mini'), { recursive: true })
    writeMap([`| [[Projects/Mini/主页]] | \`${join(repos, 'good', 'apps', 'mini')}\` | 小程序应用 | |`])
    const { projects } = await service.load()
    expect(projects[0]).toMatchObject({ available: true })
  })

  it('require() finds projects by id and rejects unknown or unavailable ones', async () => {
    writeMap([
      `| [[Projects/Good/主页]] | \`${join(repos, 'good')}\` | H5 应用 | |`,
      `| [[Projects/Plain/主页]] | \`${join(repos, 'plain')}\` | H5 应用 | |`
    ])
    const { projects } = await service.load()
    expect((await service.require(projects[0].id)).name).toBe('Good')
    await expect(service.require('nope')).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    await expect(service.require(projects[1].id)).rejects.toMatchObject({ code: 'PROJECT_UNAVAILABLE' })
  })

  it('emits changed after the map file is modified', async () => {
    writeMap([])
    await service.load()
    service.watch()
    const changed = new Promise<void>((resolve) => service.once('changed', resolve))
    setTimeout(() => writeMap([`| [[Projects/Good/主页]] | \`${join(repos, 'good')}\` | H5 应用 | |`]), 100)
    await changed
    expect((await service.current()).projects).toHaveLength(1)
  })
})
