import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TapdItem } from '../../shared/types'
import { cardFileName, createCard, findCard, projectFolder, renderCard } from './taskCard'

let vault: string
beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'wb-vault-'))
})
afterEach(() => rmSync(vault, { recursive: true, force: true }))

const item: TapdItem = {
  key: 'story:1135364280001015493',
  kind: 'story',
  id: '1135364280001015493',
  workspaceId: '35364280',
  workspaceName: '多经项目',
  title: '4. 充电订单列表新增通联业务单号/分账订单号',
  status: 'status_4',
  statusLabel: '未启动',
  iterationId: null,
  iterationName: null,
  owners: ['陈志强'],
  priority: null,
  modified: '2026-10-23 15:53:32',
  url: 'https://www.tapd.cn/35364280/prong/stories/view/1135364280001015493'
}
const now = new Date(2026, 9, 24, 9, 5, 7)
const project = { obsidianLink: 'Projects/驴充充后台/主页', repoPath: 'D:\\job\\code\\lvcc-manage-admin' }

describe('task card', () => {
  it('derives the project folder from the obsidian link', () => {
    expect(projectFolder('Projects/驴充充后台/主页')).toBe('Projects/驴充充后台')
    expect(projectFolder('主页')).toBe('Projects')
  })

  it('builds a safe file name', () => {
    expect(cardFileName('a/b:c*d?"e"<f>|g', now)).toBe('task-20261024-a-b-c-d-e-f-g.md')
    expect(cardFileName('x'.repeat(100), now)).toBe(`task-20261024-${'x'.repeat(60)}.md`)
  })

  it('renders frontmatter and the description', () => {
    const md = renderCard({ item, description: '第一段\n\n第二段', folderName: '驴充充后台', repoPath: project.repoPath, now })
    expect(md).toContain("title: '4. 充电订单列表新增通联业务单号/分账订单号'")
    expect(md).toContain('project: 驴充充后台')
    expect(md).toContain('type: feature')
    expect(md).toContain(`source: ${item.url}`)
    expect(md).toContain("tapd_id: '1135364280001015493'")
    expect(md).toContain('created: 2026-10-24 09:05:07')
    expect(md).toContain('## 描述\n\n第一段\n\n第二段\n')
    expect(md).toContain('- 2026-10-24 09:05:07：从 TAPD 生成。')
  })

  it('creates the card once and finds it by tapd id', async () => {
    const rel = await createCard({ vaultPath: vault, project, item, description: '', now })
    expect(rel).toBe('Projects/驴充充后台/task-20261024-4. 充电订单列表新增通联业务单号-分账订单号.md')
    expect(readFileSync(join(vault, rel), 'utf8')).toContain('tapd_id:')
    expect(await findCard(vault, item.id)).toBe(rel)
    expect(await createCard({ vaultPath: vault, project, item, description: '', now })).toBe(rel)
  })

  it('adds a suffix when the file name is taken by another card', async () => {
    mkdirSync(join(vault, 'Projects', '驴充充后台'), { recursive: true })
    const taken = join(vault, 'Projects', '驴充充后台', cardFileName(item.title, now))
    writeFileSync(taken, '---\ntitle: other\n---\n')
    const rel = await createCard({ vaultPath: vault, project, item, description: '', now })
    expect(rel.endsWith('-2.md')).toBe(true)
  })

  it('returns null when no card exists', async () => {
    expect(await findCard(vault, '123')).toBeNull()
  })
})
