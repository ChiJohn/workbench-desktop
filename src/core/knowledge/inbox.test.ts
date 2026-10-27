import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { classifyInbox, ingestDroppedFile } from './inbox'

let vault: string
afterEach(() => vault && rmSync(vault, { recursive: true, force: true }))

describe('inbox classify', () => {
  it('promotes an image to 排错 when the text is an error', () => {
    expect(classifyInbox('shot.png', 'TypeError: cannot read properties')).toMatchObject({ category: '排错' })
  })

  it('keeps a plain screenshot and a spreadsheet in their own categories', () => {
    expect(classifyInbox('screen.png', '')).toMatchObject({ category: '截图', title: 'screen' })
    expect(classifyInbox('名单.csv', '姓名,电话')).toMatchObject({ category: '表格' })
  })
})

describe('inbox store', () => {
  it('copies a text file into the vault and writes a knowledge note', async () => {
    vault = mkdtempSync(join(tmpdir(), 'wb-inbox-'))
    const source = join(vault, '接口说明.md')
    writeFileSync(source, '# 登录接口\n\n请求体里带 token。\n', 'utf8')
    const item = await ingestDroppedFile(vault, source, async () => ({ text: '', meaning: '' }), new Date('2026-10-27T12:00:00'))
    expect(item.category).toBe('接口')
    expect(item.filePath).toBe('附件/收件/2026-10-27/接口说明.md')
    expect(item.notePath.startsWith('知识/2026-10-27-')).toBe(true)
    const note = readFileSync(join(vault, item.notePath), 'utf8')
    expect(note).toContain('![[附件/收件/2026-10-27/接口说明.md]]')
    expect(note).toContain('登录接口')
  })

  it('refuses a directory', async () => {
    vault = mkdtempSync(join(tmpdir(), 'wb-inbox-'))
    await expect(ingestDroppedFile(vault, vault, async () => ({ text: '', meaning: '' }))).rejects.toMatchObject({ code: 'INBOX_DIRECTORY' })
  })
})
