import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findDeposit, noteFileName, renderKnowledge, renderQa, saveNote } from './notes'

let vault: string
afterEach(() => vault && rmSync(vault, { recursive: true, force: true }))

const created = '2026-10-26'

describe('knowledge notes', () => {
  it('builds a dated file name and strips characters that are illegal in file names', () => {
    expect(noteFileName(created, '失败原因字段')).toBe('2026-10-26-失败原因字段.md')
    expect(noteFileName(created, 'a/b:c')).toBe('2026-10-26-a-b-c.md')
    expect(noteFileName(created, 'x'.repeat(80))).toBe(`2026-10-26-${'x'.repeat(40)}.md`)
  })

  it('renders a knowledge note and a qa note', () => {
    expect(renderKnowledge({ title: '失败原因', project: '驴充充后台', task: '任务/a.md', sources: ['任务/a.md'], body: '- 取第一个非空值', created })).toBe(`---
type: knowledge
project: 驴充充后台
task: 任务/a.md
sources:
  - 任务/a.md
created: 2026-10-26
---

# 失败原因

- 取第一个非空值
`)
    expect(renderQa({ question: '怎么处理？', project: '', answer: '取第一个非空值。', sources: ['任务/a.md'], created })).toContain('type: qa')
    expect(renderQa({ question: '怎么处理？', project: '', answer: '取第一个非空值。', sources: ['任务/a.md'], created })).toContain('# 回答\n\n取第一个非空值。')
    expect(renderQa({ question: '怎么处理？', project: '', answer: '取第一个非空值。', sources: ['任务/a.md'], created })).not.toContain('project:')
  })

  it('writes a new file under 知识 and adds a suffix when the name is taken', async () => {
    vault = mkdtempSync(join(tmpdir(), 'wb-knowledge-'))
    const first = await saveNote(vault, '知识', renderKnowledge({ title: '失败原因', project: '驴充充后台', sources: [], body: '- a', created }), created, '失败原因')
    const second = await saveNote(vault, '知识', renderKnowledge({ title: '失败原因', project: '驴充充后台', sources: [], body: '- b', created }), created, '失败原因')
    expect(first).toBe('知识/2026-10-26-失败原因.md')
    expect(second).toBe('知识/2026-10-26-失败原因-2.md')
    expect(readFileSync(join(vault, ...first.split('/')), 'utf8')).toContain('- a')
  })

  it('finds an existing deposit by the task path', async () => {
    vault = mkdtempSync(join(tmpdir(), 'wb-knowledge-'))
    const rel = await saveNote(vault, '知识', renderKnowledge({ title: '失败原因', project: '驴充充后台', task: '任务/a.md', sources: [], body: '- a', created }), created, '失败原因')
    expect(await findDeposit(vault, '任务/a.md')).toBe(rel)
    expect(await findDeposit(vault, '任务/missing.md')).toBeNull()
  })

  it('refuses to write outside the knowledge folders', async () => {
    vault = mkdtempSync(join(tmpdir(), 'wb-knowledge-'))
    await expect(saveNote(vault, '../outside' as '知识', 'x', created, '标题')).rejects.toMatchObject({ code: 'KNOWLEDGE_PATH' })
  })
})
