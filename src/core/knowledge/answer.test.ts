import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { keepSources, parseDraft, splitAnswer } from './answer'

let vault: string
afterEach(() => vault && rmSync(vault, { recursive: true, force: true }))

describe('answer sources', () => {
  it('splits the answer from the trailing SOURCES block', () => {
    const text = '取第一个非空值。\n\nSOURCES:\n任务/a.md\n- [[项目/驴充充后台/主页]]\n'
    expect(splitAnswer(text)).toEqual({ body: '取第一个非空值。', sources: ['任务/a.md', '项目/驴充充后台/主页'] })
    expect(splitAnswer('没有来源')).toEqual({ body: '没有来源', sources: [] })
  })

  it('keeps only relative paths that exist inside the vault', () => {
    vault = mkdtempSync(join(tmpdir(), 'wb-knowledge-'))
    mkdirSync(join(vault, '任务'))
    writeFileSync(join(vault, '任务', 'a.md'), '# a')
    expect(keepSources(vault, ['任务/a.md', '任务/missing.md', '../outside.md', 'C:/Windows/win.ini'])).toEqual({
      sources: ['任务/a.md'],
      dropped: 3
    })
  })

  it('parses a distilled draft', () => {
    expect(parseDraft('TITLE: 失败原因字段\n\n- 取第一个非空值\n', '原标题')).toEqual({ title: '失败原因字段', body: '- 取第一个非空值' })
    expect(parseDraft('# 另一个标题\n\n- a\n', '原标题')).toEqual({ title: '另一个标题', body: '- a' })
    expect(parseDraft('- 只有要点', '原标题')).toEqual({ title: '原标题', body: '- 只有要点' })
  })
})
