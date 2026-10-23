import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendToSection, backfillCard, setFrontmatter, setResult } from './taskCard'

let vault: string
beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'wb-backfill-'))
})
afterEach(() => rmSync(vault, { recursive: true, force: true }))

const now = new Date(2026, 9, 24, 10, 0, 0)
const project = { obsidianLink: 'Projects/驴充充后台/主页', repoPath: 'D:\\job\\code\\lvcc-manage-admin' }
const issue = { identifier: 'JINB-223', title: '充电订单列表：新增通联业务单号', url: 'https://multica.ai/jinbi/issues/JINB-223', assigneeName: '前端开发' }

const CARD = `---
title: '旧卡'
status: todo
tapd_id: '1135364280001015493'
updated: 2026-10-24 06:45:16
---

# 旧卡

## 执行记录

- 2026-10-24 06:45:16：从 TAPD 生成。

## 结果

待填写。
`

describe('markdown helpers', () => {
  it('sets an existing frontmatter key or inserts a new one', () => {
    const md = setFrontmatter(setFrontmatter(CARD, 'status', 'done'), 'multica_id', "'JINB-1'")
    expect(md).toContain('status: done\n')
    expect(md).toContain("multica_id: 'JINB-1'\n---")
    expect(md).not.toContain('status: todo')
  })

  it('appends a line at the end of a section', () => {
    const md = appendToSection(CARD, '执行记录', '- 新记录')
    expect(md).toContain('- 2026-10-24 06:45:16：从 TAPD 生成。\n- 新记录\n\n## 结果')
  })

  it('creates a missing section at the end', () => {
    expect(appendToSection('# t\n', '执行记录', '- x')).toBe('# t\n\n## 执行记录\n\n- x\n')
  })

  it('replaces a placeholder result and appends otherwise', () => {
    const once = setResult(CARD, '第一次结论', 'JINB-1')
    expect(once.endsWith('## 结果\n\n第一次结论\n')).toBe(true)
    expect(setResult(once, '第二次', 'JINB-2').endsWith('## 结果\n\n第一次结论\n\n### JINB-2\n\n第二次\n')).toBe(true)
  })
})

describe('backfillCard', () => {
  it('updates the card found by tapd_id', async () => {
    mkdirSync(join(vault, 'Projects', '驴充充后台'), { recursive: true })
    writeFileSync(join(vault, 'Projects', '驴充充后台', 'task-20261024-旧卡.md'), CARD)
    const rel = await backfillCard({ vaultPath: vault, project, issue, description: '描述', conclusion: '已完成，单测通过', tapd: { id: '1135364280001015493', kind: 'story' }, now })
    expect(rel).toBe('Projects/驴充充后台/task-20261024-旧卡.md')
    const md = readFileSync(join(vault, ...rel.split('/')), 'utf8')
    expect(md).toContain('status: done')
    expect(md).toContain('updated: 2026-10-24 10:00:00')
    expect(md).toContain("multica_id: 'JINB-223'")
    expect(md).toContain('- 2026-10-24 10:00:00：multica JINB-223 由「前端开发」完成，已验收。')
    expect(md).toContain('## 结果\n\n已完成，单测通过\n')
  })

  it('finds the card by multica_id on a second backfill', async () => {
    const first = await backfillCard({ vaultPath: vault, project, issue, description: '描述', conclusion: '一', tapd: null, now })
    const second = await backfillCard({ vaultPath: vault, project, issue, description: '描述', conclusion: '二', tapd: null, now })
    expect(second).toBe(first)
    expect(readdirSync(join(vault, 'Projects', '驴充充后台'))).toHaveLength(1)
  })

  it('creates a done card when none exists', async () => {
    const rel = await backfillCard({ vaultPath: vault, project, issue, description: '## 仓库\n\n`x`', conclusion: null, tapd: { id: '42', kind: 'bug' }, now })
    expect(rel).toBe('Projects/驴充充后台/task-20261024-充电订单列表：新增通联业务单号.md')
    const md = readFileSync(join(vault, ...rel.split('/')), 'utf8')
    expect(md).toContain("title: '充电订单列表：新增通联业务单号'")
    expect(md).toContain('type: bug')
    expect(md).toContain('status: done')
    expect(md).toContain('source: https://multica.ai/jinbi/issues/JINB-223')
    expect(md).toContain("tapd_id: '42'")
    expect(md).toContain("multica_id: 'JINB-223'")
    expect(md).toContain('## 描述\n\n## 仓库\n\n`x`\n')
    expect(md).toContain('- 2026-10-24 10:00:00：从 multica JINB-223 生成。\n- 2026-10-24 10:00:00：multica JINB-223 由「前端开发」完成，已验收。')
    expect(md).toContain('## 结果\n\n智能体没有留下结论。\n')
  })

  it('omits the assignee from the log when the issue is unassigned', async () => {
    const rel = await backfillCard({ vaultPath: vault, project, issue: { ...issue, assigneeName: null }, description: '', conclusion: null, tapd: null, now })
    const md = readFileSync(join(vault, ...rel.split('/')), 'utf8')
    expect(md).toContain('- 2026-10-24 10:00:00：multica JINB-223 已完成，已验收。')
    expect(md).toContain('type: feature')
  })
})
