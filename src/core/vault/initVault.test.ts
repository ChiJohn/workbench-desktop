import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseRepoMap } from '../registry/parseRepoMap'
import { DEFAULT_TEMPLATES } from '../report/templates'
import { initVault } from './initVault'

let root: string
beforeEach(() => (root = mkdtempSync(join(tmpdir(), 'wb-init-'))))
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('initVault', () => {
  it('creates the folders, the project map and the report templates in a new folder', async () => {
    const vault = join(root, '新库')
    const r = await initVault(vault)
    expect(r.created).toEqual(
      expect.arrayContaining(['主页.md', '项目.md', '任务/', '知识/', '问答/', '附件/', '项目/', '汇报/日报/', '汇报/周报/', '汇报/月报/', '汇报/模板/汇报-周报.md'])
    )
    expect(r.skipped).toEqual([])
    expect(readFileSync(join(vault, '汇报', '模板', '汇报-周报.md'), 'utf8')).toBe(DEFAULT_TEMPLATES.weekly)
    const map = parseRepoMap(readFileSync(join(vault, '项目.md'), 'utf8'))
    expect(map).toEqual({ projects: [], skipped: [] })
  })

  it('never overwrites existing files', async () => {
    writeFileSync(join(root, '项目.md'), '我的映射')
    mkdirSync(join(root, '任务'))
    const r = await initVault(root)
    expect(readFileSync(join(root, '项目.md'), 'utf8')).toBe('我的映射')
    expect(r.skipped).toEqual(expect.arrayContaining(['项目.md', '任务/']))
    expect(r.created).toContain('主页.md')
  })

  it('rejects an empty or relative path', async () => {
    await expect(initVault('')).rejects.toMatchObject({ code: 'VAULT_PATH' })
    await expect(initVault('relative\\vault')).rejects.toMatchObject({ code: 'VAULT_PATH' })
  })
})
