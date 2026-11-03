import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTerminalAiLaunchLine, upsertVaultTerminalTaskCard } from './terminalDispatch'

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
    } finally {
      rmSync(vault, { recursive: true, force: true })
    }
  })

  it('builds single-line interactive CLI command pointing to Vault task card', () => {
    const line = buildTerminalAiLaunchLine({
      writer: 'claude',
      cardFullPath: 'D:\\job\\notes\\任务\\task-20261103-新增导出按钮.md',
      title: '新增导出按钮'
    })
    expect(line).toContain('D:/job/notes/任务/task-20261103-新增导出按钮.md')
    expect(line).toMatch(/^claude "/)
  })
})
