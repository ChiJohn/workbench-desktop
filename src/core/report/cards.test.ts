import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectCards } from './cards'

let vault: string
beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'wb-cards-'))
  mkdirSync(join(vault, 'Projects', '驴充充后台'), { recursive: true })
})
afterEach(() => rmSync(vault, { recursive: true, force: true }))

const card = (title: string, status: string, updated: string, log: string[], result = '待填写。') => `---
title: '${title}'
status: ${status}
updated: ${updated}
---

# ${title}

## 执行记录

${log.map((l) => `- ${l}`).join('\n')}

## 结果

${result}
`

describe('collectCards', () => {
  it('collects cards updated in the range with in-range log lines and the result of done cards', async () => {
    const dir = join(vault, 'Projects', '驴充充后台')
    writeFileSync(
      join(dir, 'task-20261020-分账.md'),
      card('分账失败原因', 'done', '2026-10-22 18:00:00', ['2026-10-10 09:00:00：从 TAPD 生成。', '2026-10-22 18:00:00：multica JINB-1 由「前端开发」完成，已验收。'], '订单详情、分账单展示失败原因')
    )
    writeFileSync(join(dir, 'task-20261001-旧.md'), card('旧卡', 'done', '2026-10-01 10:00:00', ['2026-10-01 10:00:00：完成']))
    writeFileSync(join(dir, 'task-20261021-进行中.md'), card('进行中', 'todo', '2026-10-21 10:00:00', ['2026-10-21 10:00:00：从 TAPD 生成。']))
    writeFileSync(join(dir, 'notes.md'), card('不是任务卡', 'done', '2026-10-22 10:00:00', []))

    const entries = await collectCards(vault, { start: '2026-10-17', end: '2026-10-23' })
    expect(entries).toEqual([
      {
        id: 'card:Projects/驴充充后台/task-20261020-分账.md',
        source: 'cards',
        group: '驴充充后台',
        title: '分账失败原因',
        detail: '状态：done\n2026-10-22 18:00:00：multica JINB-1 由「前端开发」完成，已验收。\n结果：订单详情、分账单展示失败原因',
        time: '2026-10-22 18:00'
      },
      {
        id: 'card:Projects/驴充充后台/task-20261021-进行中.md',
        source: 'cards',
        group: '驴充充后台',
        title: '进行中',
        detail: '状态：todo\n2026-10-21 10:00:00：从 TAPD 生成。',
        time: '2026-10-21 10:00'
      }
    ])
  })

  it('returns nothing when the vault has no Projects folder', async () => {
    expect(await collectCards(join(vault, 'missing'), { start: '2026-10-17', end: '2026-10-23' })).toEqual([])
  })
})
