import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSection, writeSection } from '../markdown/sections'
import {
  buildTerminalAiLaunchLine,
  knowledgeDispatchQuery,
  renderKnowledgeDispatchContext,
  upsertVaultTerminalTaskCard
} from './terminalDispatch'
import type { TapdItem } from '../../shared/types'

describe('terminalDispatch', () => {
  it('saves task card directly into Obsidian Vault 任务/ directory with align contracts and UA clues', async () => {
    const vault = mkdtempSync(join(tmpdir(), 'wb-vault-task-'))
    try {
      const { cardRel, cardFullPath } = await upsertVaultTerminalTaskCard({
        vaultPath: vault,
        project: {
          name: '驴充充后台',
          obsidianLink: '项目/驴充充后台/主页',
          repoPath: 'D:\\job\\code\\lvcc-manage-admin'
        },
        writer: 'claude',
        title: '修复充值订单导出报错',
        description: '点击导出按钮时接口超时',
        tapdItem: {
          key: 'bug:101',
          kind: 'bug',
          id: '101',
          workspaceId: '1',
          workspaceName: '驴充充',
          title: '修复充值订单导出报错',
          status: 'new',
          statusLabel: '新',
          iterationId: null,
          iterationName: null,
          owners: ['tester'],
          priority: 'high',
          modified: '2026-11-03',
          url: 'https://www.tapd.cn/1/bugtrace/bugs/view?bug_id=101'
        },
        designs: [{ name: '充值列表页', url: 'https://figma.com/file/1' }],
        contracts: [{ title: '导出充值记录', path: '项目/驴充充后台/接口/export.md', body: 'POST /recharge/export' }],
        uaContext: '## 代码图谱线索（Understand Anything）\n\n- `src/views/order/recharge/index.vue`'
      })

      expect(cardRel).toMatch(/^任务\/task-\d{8}-修复充值订单导出报错\.md$/)
      const md = readFileSync(cardFullPath, 'utf8')
      expect(md).toContain('status: doing')
      expect(md).toContain('点击导出按钮时接口超时')
      expect(md).toContain('POST /recharge/export')
      expect(md).toContain('src/views/order/recharge/index.vue')
      expect(md).toContain('派给终端 AI（Claude）处理')
      expect(readSection(md, '约定')).toBe('待填写。')
    } finally {
      rmSync(vault, { recursive: true, force: true })
    }
  })

  it('puts the top knowledge excerpts in 派单上下文 and keeps 结果 and 约定 on the next dispatch', async () => {
    const vault = mkdtempSync(join(tmpdir(), 'wb-vault-task-'))
    const item: TapdItem = {
      key: 'bug:101',
      kind: 'bug',
      id: '101',
      workspaceId: '1',
      workspaceName: '驴充充',
      title: '修复充值订单导出报错',
      status: 'new',
      statusLabel: '新',
      iterationId: null,
      iterationName: null,
      owners: ['tester'],
      priority: 'high',
      modified: '2026-11-03',
      url: 'https://www.tapd.cn/1/bugtrace/bugs/view?bug_id=101'
    }
    const project = {
      name: '驴充充后台',
      obsidianLink: '项目/驴充充后台/主页',
      repoPath: 'D:\\job\\code\\lvcc-manage-admin'
    }
    try {
      const knowledge = renderKnowledgeDispatchContext([
        { file: '知识/导出超时.md', snippets: ['导出  \n超时 会重试'] },
        { file: '知识/空笔记.md', snippets: ['   '] },
        { file: '知识/分账.md', snippets: ['分账单号在列表最后一列'] },
        { file: '知识/鉴权.md', snippets: ['导出接口沿用登录态'] },
        { file: '知识/第四篇不该出现.md', snippets: ['这条不该进任务卡'] }
      ])
      expect(knowledge).toContain('知识/导出超时.md')
      expect(knowledge).toContain('导出 超时 会重试')
      expect(knowledge).not.toContain('知识/第四篇不该出现.md')
      expect(knowledge).not.toContain('知识/空笔记.md')

      const first = await upsertVaultTerminalTaskCard({
        vaultPath: vault,
        project,
        writer: 'claude',
        title: item.title,
        description: '点击导出按钮时接口超时',
        tapdItem: item,
        knowledgeContext: knowledge,
        uaContext: '## 代码图谱线索（Understand Anything）\n\n- `src/views/order/recharge/index.vue`'
      })
      let md = readFileSync(first.cardFullPath, 'utf8')
      expect(readSection(md, '派单上下文')).toContain('### 知识库')
      expect(readSection(md, '派单上下文')).toContain('知识/鉴权.md')
      expect(readSection(md, '派单上下文')).not.toContain('第四篇不该出现')
      md = writeSection(md, '结果', () => '第一次结论：导出已改为流式。')
      md = writeSection(md, '约定', () => '不要改导出接口的鉴权。')
      md = md.replace(/^### /gm, '## ')
      writeFileSync(first.cardFullPath, md, 'utf8')

      const nextKnowledge = renderKnowledgeDispatchContext([{ file: '知识/新线索.md', snippets: ['超时阈值改成 30 秒'] }])
      await upsertVaultTerminalTaskCard({
        vaultPath: vault,
        project,
        writer: 'cursor',
        title: item.title,
        description: '补充：只改前端超时提示',
        tapdItem: item,
        knowledgeContext: nextKnowledge
      })
      md = readFileSync(first.cardFullPath, 'utf8')
      expect(readSection(md, '结果')).toBe('第一次结论：导出已改为流式。')
      expect(readSection(md, '约定')).toBe('不要改导出接口的鉴权。')
      expect(md.match(/^## 约定/gm)).toHaveLength(1)
      expect(md.match(/^## 派单上下文/gm)).toHaveLength(1)
      expect(readSection(md, '描述')).toBe('补充：只改前端超时提示')
      expect(readSection(md, '派单上下文')).toContain('知识/新线索.md')
      expect(readSection(md, '派单上下文')).not.toContain('知识/导出超时.md')
      expect(readSection(md, '派单上下文')).not.toContain('src/views/order/recharge/index.vue')
    } finally {
      rmSync(vault, { recursive: true, force: true })
    }
  })

  it('caps the knowledge query and the excerpt block', () => {
    expect(knowledgeDispatchQuery('  导出超时  ', '点击\n按钮  ')).toBe('导出超时 点击 按钮')
    expect(knowledgeDispatchQuery('a'.repeat(300), '')).toHaveLength(200)
    expect(knowledgeDispatchQuery('  ', '\n')).toBe('')
    const excerpt = '字'.repeat(240)
    const file = `${'知识/'.padEnd(1500, '长')}.md`
    const text = renderKnowledgeDispatchContext([
      { file, snippets: [`  ${excerpt}  \n下一行`] },
      { file: `${file}-2`, snippets: [excerpt] },
      { file: `${file}-3`, snippets: [excerpt] }
    ])
    expect(text).toBeTruthy()
    expect(text!.length).toBeLessThanOrEqual(3000)
    expect(text).toContain('已截断')
    expect(text).toContain('字'.repeat(200))
    expect(text).not.toContain('字'.repeat(201))
    expect(renderKnowledgeDispatchContext([])).toBeNull()
  })

  it('builds single-line interactive CLI command pointing to Vault task card', () => {
    const line = buildTerminalAiLaunchLine({
      writer: 'claude',
      cardFullPath: 'D:\\job\\notes\\任务\\task-20261103-新增导出按钮.md',
      title: '新增导出按钮'
    })
    expect(line).toContain('D:/job/notes/任务/task-20261103-新增导出按钮.md')
    expect(line).toMatch(/^claude "/)
    expect(line).not.toMatch(/\n/)
    expect(line).toContain('「结果」')
    expect(line).toContain('「约定」')
    expect(line).toContain('「派单上下文」')
    expect(line).toContain('知识库')
    expect(buildTerminalAiLaunchLine({ writer: 'cursor', cardFullPath: 'C:/card.md', title: 't' })).toMatch(/^cursor-agent "/)
    expect(buildTerminalAiLaunchLine({ writer: 'codex', cardFullPath: 'C:/card.md', title: 't' })).toMatch(/^codex "/)
  })
})
