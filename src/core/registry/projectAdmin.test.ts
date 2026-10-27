import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initVault } from '../vault/initVault'
import { ProjectAdmin } from './projectAdmin'
import { RegistryService } from './registryService'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

async function setup() {
  const vault = await mkdtemp(join(tmpdir(), 'wb-admin-'))
  dirs.push(vault)
  await initVault(vault)
  const registry = new RegistryService(() => vault)
  const admin = new ProjectAdmin({
    mapPath: () => registry.mapPath(),
    vaultPath: () => vault,
    reload: () => registry.load()
  })
  return { vault, admin }
}

describe('ProjectAdmin', () => {
  it('adds a project and homepage, then updates and removes only the row', async () => {
    const { vault, admin } = await setup()
    const created = await admin.add({
      name: '示例',
      repoPath: 'D:\\code\\demo',
      type: 'admin',
      note: '说明',
      createHomepage: true
    })
    expect(created).toMatchObject({ name: '示例', available: false, unavailableReason: '路径不存在' })
    const home = await readFile(join(vault, '项目', '示例', '主页.md'), 'utf8')
    expect(home).toContain('D:\\code\\demo')
    expect(home).toContain('后台前端仓库')

    await expect(
      admin.add({ name: '另一个', repoPath: 'D:\\code\\demo', type: 'other', note: '', createHomepage: true })
    ).rejects.toMatchObject({ code: 'PROJECT_EXISTS' })

    const updated = await admin.update(created.id, {
      name: '示例改',
      repoPath: 'D:\\code\\demo',
      type: 'h5',
      note: '新说明',
      createHomepage: true
    })
    expect(updated.name).toBe('示例改')
    expect(await readFile(join(vault, '项目', '示例', '主页.md'), 'utf8')).toContain('后台前端仓库')
    expect(await readFile(join(vault, '项目', '示例改', '主页.md'), 'utf8')).toContain('H5 应用')

    await admin.remove(updated.id)
    const map = await readFile(join(vault, '项目.md'), 'utf8')
    expect(map).not.toContain('示例改')
    expect(await readFile(join(vault, '项目', '示例', '主页.md'), 'utf8')).toContain('D:\\code\\demo')
  })
})
