import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES, ensureTemplate } from './templates'

let vault: string
beforeEach(() => (vault = mkdtempSync(join(tmpdir(), 'wb-tpl-'))))
afterEach(() => rmSync(vault, { recursive: true, force: true }))

describe('ensureTemplate', () => {
  it('writes the default template the first time', async () => {
    expect(await ensureTemplate(vault, 'weekly')).toBe(DEFAULT_TEMPLATES.weekly)
    expect(readFileSync(join(vault, '汇报', '模板', '汇报-周报.md'), 'utf8')).toBe(DEFAULT_TEMPLATES.weekly)
  })

  it('keeps the template the user edited', async () => {
    mkdirSync(join(vault, '汇报', '模板'), { recursive: true })
    writeFileSync(join(vault, '汇报', '模板', '汇报-日报.md'), '我的日报模板')
    expect(await ensureTemplate(vault, 'daily')).toBe('我的日报模板')
  })
})
