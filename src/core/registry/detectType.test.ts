import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectType } from './detectType'

const dirs: string[] = []

async function dir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'wb-type-'))
  dirs.push(path)
  return path
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

describe('detectType', () => {
  it('reads marker files and package dependencies', async () => {
    const mini = await dir()
    await writeFile(join(mini, 'project.config.json'), '{}')
    expect(await detectType(mini)).toBe('miniapp')

    const cli = await dir()
    await writeFile(join(cli, 'go.mod'), 'module x')
    expect(await detectType(cli)).toBe('cli')

    const admin = await dir()
    await writeFile(join(admin, 'package.json'), JSON.stringify({ dependencies: { 'element-plus': '1' } }))
    expect(await detectType(admin)).toBe('admin')

    const h5 = await dir()
    await writeFile(join(h5, 'package.json'), JSON.stringify({ devDependencies: { vant: '4' } }))
    expect(await detectType(h5)).toBe('h5')

    const vben = await dir()
    await writeFile(join(vben, 'package.json'), JSON.stringify({ dependencies: { '@vben/utils': '1' } }))
    expect(await detectType(vben)).toBe('admin')

    expect(await detectType(join(await dir(), 'missing'))).toBe('other')
  })

  it('returns other for a plain package', async () => {
    const plain = await dir()
    await mkdir(plain, { recursive: true })
    await writeFile(join(plain, 'package.json'), JSON.stringify({ dependencies: { react: '19' } }))
    expect(await detectType(plain)).toBe('other')
  })
})
