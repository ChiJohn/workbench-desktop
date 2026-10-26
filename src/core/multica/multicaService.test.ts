import { describe, expect, it } from 'vitest'
import { AppError } from '../result'
import { dispatchDescription, MulticaService, type MulticaCliLike } from './multicaService'

const WS = [
  { id: 'w-other', name: '水星', slug: 'iapetus' },
  { id: 'w1', name: 'jinbi', slug: 'jinbi' }
]
const PROJECTS = [
  { id: 'p1', title: '驴充充后台', description: '代码仓库目录：D:\\job\\code\\lvcc-manage-admin' },
  { id: 'p2', title: '无关项目', description: '' }
]
const AGENTS = [
  { id: 'a1', name: '前端开发', archived_at: null },
  { id: 'a2', name: '旧智能体', archived_at: '2026-01-01' }
]
const RUNTIMES = [
  { id: 'r1', name: 'Cursor (PC)', provider: 'cursor', status: 'online', daemon_id: 'd1' },
  { id: 'r2', name: 'Claude (Mac)', provider: 'claude', status: 'offline', daemon_id: 'd2' }
]
const DAEMON = { status: 'running', daemon_id: 'd1', running_task_count: 1 }
const REPOS = [{ id: 'd:\\job\\code\\lvcc-manage-admin', repoPath: 'D:\\job\\code\\lvcc-manage-admin', obsidianLink: 'Projects/驴充充后台/主页' }]

const issue = (n: number, status: string, extra: Record<string, unknown> = {}) => ({
  id: `i${n}`,
  identifier: `JINB-${n}`,
  title: `任务${n}`,
  status,
  assignee_type: 'agent',
  assignee_id: 'a1',
  project_id: 'p1',
  updated_at: `2026-10-2${n % 10}T00:00:00Z`,
  metadata: {},
  ...extra
})

interface Call {
  args: string[]
  workspaceId?: string
  cwd?: string
  body?: string
}

function fakeCli(routes: Record<string, (args: string[]) => unknown>) {
  const calls: Call[] = []
  const cli: MulticaCliLike = {
    async json<T>(args: string[], opts: { workspaceId?: string; cwd?: string } = {}) {
      calls.push({ args, ...opts, body: opts.cwd ? lastBody : undefined })
      const key = Object.keys(routes).find((k) => args.join(' ').startsWith(k))
      if (!key) throw new Error(`unexpected call: ${args.join(' ')}`)
      return routes[key](args) as T
    },
    async withTempFile<T>(content: string, fn: (name: string, cwd: string) => Promise<T>) {
      lastBody = content
      return fn('body.md', 'C:\\tmp\\x')
    }
  }
  let lastBody = ''
  return { cli, calls }
}

const baseRoutes = (issues: Record<string, ReturnType<typeof issue>[]> = {}) => ({
  'workspace list': () => WS,
  'project list': () => PROJECTS,
  'agent list': () => AGENTS,
  'runtime list': () => RUNTIMES,
  'daemon status': () => DAEMON,
  'issue list': (args: string[]) => {
    const status = args[args.indexOf('--status') + 1]
    const offset = Number(args[args.indexOf('--offset') + 1])
    const all = issues[status] ?? []
    const page = all.slice(offset, offset + 100)
    return { issues: page, has_more: offset + 100 < all.length, total: all.length }
  }
})

function service(routes: Record<string, (args: string[]) => unknown>, prefs: Record<string, unknown> = {}) {
  const f = fakeCli(routes)
  const s = new MulticaService(f.cli, { repos: () => REPOS, prefs: () => prefs })
  return { s, calls: f.calls }
}

describe('MulticaService.overview', () => {
  it('picks the jinbi workspace by default and summarizes open issues', async () => {
    const { s, calls } = service(
      baseRoutes({ in_review: [issue(1, 'in_review', { metadata: { tapd_key: 'story:9' } })], todo: [issue(2, 'todo', { assignee_type: 'member', assignee_id: 'm1', project_id: null })] })
    )
    const o = await s.overview(false)
    expect(o.workspace).toEqual({ id: 'w1', name: 'jinbi', slug: 'jinbi' })
    expect(o.daemon).toEqual({ running: true, runningTasks: 1 })
    expect(o.runtimes).toEqual([{ id: 'r1', name: 'Cursor (PC)', provider: 'cursor', online: true }])
    expect(o.agents).toEqual([{ id: 'a1', name: '前端开发' }])
    expect(o.projects.find((p) => p.id === 'p1')).toMatchObject({ repoId: 'd:\\job\\code\\lvcc-manage-admin', matchedBy: 'path' })
    expect(o.issues).toEqual([
      {
        id: 'i1',
        identifier: 'JINB-1',
        title: '任务1',
        status: 'in_review',
        assigneeType: 'agent',
        assigneeId: 'a1',
        assigneeName: '前端开发',
        projectId: 'p1',
        projectTitle: '驴充充后台',
        repoId: 'd:\\job\\code\\lvcc-manage-admin',
        updatedAt: '2026-10-21T00:00:00Z',
        url: 'https://multica.ai/jinbi/issues/JINB-1',
        tapdKey: 'story:9'
      },
      expect.objectContaining({ id: 'i2', assigneeName: '成员', projectId: null, projectTitle: null, repoId: null })
    ])
    const statuses = calls.filter((c) => c.args[0] === 'issue').map((c) => c.args[c.args.indexOf('--status') + 1])
    expect(statuses.sort()).toEqual(['backlog', 'blocked', 'in_progress', 'in_review', 'todo'])
    expect(calls.find((c) => c.args[0] === 'issue')?.workspaceId).toBe('w1')
  })

  it('uses the configured workspace and pages through long lists', async () => {
    const many = Array.from({ length: 130 }, (_, i) => issue(i + 1, 'backlog'))
    const { s, calls } = service(baseRoutes({ backlog: many }), { workspaceId: 'w-other' })
    const o = await s.overview(false)
    expect(o.workspace.id).toBe('w-other')
    expect(o.issues).toHaveLength(130)
    expect(calls.filter((c) => c.args.includes('backlog')).map((c) => c.args[c.args.indexOf('--offset') + 1])).toEqual(['0', '100'])
  })

  it('caches metadata until forced and tolerates a daemon status failure', async () => {
    const routes = { ...baseRoutes(), 'daemon status': () => { throw new AppError('MULTICA_ERROR', 'no daemon') } }
    const { s, calls } = service(routes)
    const first = await s.overview(false)
    expect(first.daemon).toBeNull()
    expect(first.runtimes).toEqual([])
    await s.overview(false)
    expect(calls.filter((c) => c.args[0] === 'agent').length).toBe(1)
    await s.overview(true)
    expect(calls.filter((c) => c.args[0] === 'agent').length).toBe(2)
  })
})

describe('MulticaService.issue', () => {
  it('returns description, named comments and the last agent comment as conclusion', async () => {
    const { s } = service({
      ...baseRoutes(),
      'issue get': () => ({ ...issue(3, 'in_review'), description: '## 仓库\r\n\r\n`D:\\x`' }),
      'issue comment list': () => [
        { id: 'c1', author_type: 'member', author_id: 'm1', content: '开工', created_at: '2026-10-22T01:00:00Z' },
        { id: 'c2', author_type: 'agent', author_id: 'a1', content: '第一次交付', created_at: '2026-10-22T02:00:00Z' },
        { id: 'c3', author_type: 'agent', author_id: 'a1', content: '最终结论', created_at: '2026-10-22T03:00:00Z' }
      ]
    })
    const d = await s.issue('JINB-3')
    expect(d.description).toBe('## 仓库\n\n`D:\\x`')
    expect(d.comments.map((c) => `${c.authorName}:${c.content}`)).toEqual(['成员:开工', '前端开发:第一次交付', '前端开发:最终结论'])
    expect(d.conclusion).toBe('最终结论')
    expect(d.issue.identifier).toBe('JINB-3')
  })
})

describe('MulticaService dispatch', () => {
  it('builds the description from repo, source and body', () => {
    expect(dispatchDescription({ repoPath: 'D:\\r', kind: 'bug', url: 'https://t/1', body: '正文' })).toBe(
      '## 仓库\n\n`D:\\r`\n\n## 来源\n\nTAPD 缺陷：https://t/1\n\n## 描述\n\n正文\n'
    )
    expect(dispatchDescription({ repoPath: null, kind: 'story', url: 'u', body: '' })).toBe('## 来源\n\nTAPD 需求：u\n\n## 描述\n\n（TAPD 正文为空）\n')
  })

  it('finds an existing issue by tapd key', async () => {
    const { s, calls } = service({ ...baseRoutes(), 'issue list': () => ({ issues: [issue(5, 'todo', { metadata: { tapd_key: 'story:9' } })], has_more: false }) })
    expect((await s.findByTapd('story:9'))?.identifier).toBe('JINB-5')
    expect(calls.at(-1)?.args).toEqual(expect.arrayContaining(['--metadata', 'tapd_key=story:9']))
  })

  it('creates the issue with project and agent, then writes tapd_key', async () => {
    const { s, calls } = service({
      ...baseRoutes(),
      'issue list': () => ({ issues: [], has_more: false }),
      'issue create': () => issue(7, 'todo'),
      'issue metadata set': () => ({})
    })
    const r = await s.dispatch({ tapdKey: 'bug:1', title: '标题', projectId: 'p1', agentId: 'a1' }, '描述内容')
    expect(r.issue.identifier).toBe('JINB-7')
    expect(r.warning).toBeUndefined()
    const create = calls.find((c) => c.args[1] === 'create')!
    expect(create.args).toEqual(['issue', 'create', '--title', '标题', '--description-file', 'body.md', '--project', 'p1', '--assignee-id', 'a1'])
    expect(create.cwd).toBe('C:\\tmp\\x')
    expect(create.body).toBe('描述内容')
    expect(calls.at(-1)?.args).toEqual(['issue', 'metadata', 'set', 'i7', '--key', 'tapd_key', '--value', 'bug:1', '--type', 'string'])
  })

  it('omits project and assignee when not chosen', async () => {
    const { s, calls } = service({
      ...baseRoutes(),
      'issue list': () => ({ issues: [], has_more: false }),
      'issue create': () => issue(8, 'backlog', { assignee_type: null, assignee_id: null }),
      'issue metadata set': () => ({})
    })
    await s.dispatch({ tapdKey: 'task:2', title: 't', projectId: null, agentId: null }, 'd')
    expect(calls.find((c) => c.args[1] === 'create')!.args).toEqual(['issue', 'create', '--title', 't', '--description-file', 'body.md'])
  })

  it('refuses to dispatch the same tapd item twice', async () => {
    const { s } = service({ ...baseRoutes(), 'issue list': () => ({ issues: [issue(5, 'todo')], has_more: false }) })
    await expect(s.dispatch({ tapdKey: 'story:9', title: 't', projectId: null, agentId: null }, 'd')).rejects.toMatchObject({
      code: 'MULTICA_ALREADY_DISPATCHED'
    })
  })

  it('reports a warning when tapd_key cannot be written', async () => {
    const { s } = service({
      ...baseRoutes(),
      'issue list': () => ({ issues: [], has_more: false }),
      'issue create': () => issue(9, 'todo'),
      'issue metadata set': () => {
        throw new AppError('MULTICA_ERROR', 'boom')
      }
    })
    const r = await s.dispatch({ tapdKey: 'story:1', title: 't', projectId: null, agentId: null }, 'd')
    expect(r.warning).toContain('JINB-9')
  })
})

describe('MulticaService comment / complete', () => {
  it('mentions the assigned agent at the end of the comment', async () => {
    const { s, calls } = service({ ...baseRoutes(), 'issue get': () => issue(3, 'in_review'), 'issue comment add': () => ({}) })
    await s.comment('JINB-3', '列名不对，改成「分账单号」')
    const add = calls.find((c) => c.args[2] === 'add')!
    expect(add.args).toEqual(['issue', 'comment', 'add', 'JINB-3', '--content-file', 'body.md'])
    expect(add.body).toBe('列名不对，改成「分账单号」\n\n[@前端开发](mention://agent/a1)')
  })

  it('does not mention anyone when a member is assigned', async () => {
    const { s, calls } = service({
      ...baseRoutes(),
      'issue get': () => issue(3, 'in_review', { assignee_type: 'member', assignee_id: 'm1' }),
      'issue comment add': () => ({})
    })
    await s.comment('JINB-3', '看一下')
    expect(calls.find((c) => c.args[2] === 'add')!.body).toBe('看一下')
  })

  it('marks done without starting a run', async () => {
    const { s, calls } = service({ ...baseRoutes(), 'issue status': () => null })
    await s.complete('JINB-3')
    expect(calls.at(-1)?.args).toEqual(['issue', 'status', 'JINB-3', 'done', '--no-start'])
    expect(calls.at(-1)?.workspaceId).toBe('w1')
  })
})

describe('MulticaService.doneBetween', () => {
  it('keeps done issues updated in the local date range with the first paragraph of the agent conclusion', async () => {
    const done = [
      issue(1, 'done', { updated_at: '2026-10-16T04:00:00Z' }),
      issue(2, 'done', { updated_at: '2026-10-18T04:00:00Z' }),
      issue(3, 'done', { updated_at: '2026-10-23T04:00:00Z', assignee_type: null, assignee_id: null }),
      issue(4, 'done', { updated_at: '2026-10-24T04:00:00Z' })
    ]
    const { s, calls } = service({
      ...baseRoutes({ done }),
      'issue comment list': (args) =>
        args[3] === 'i2'
          ? [
              { id: 'c1', author_type: 'agent', author_id: 'a1', content: '旧结论', created_at: '2026-10-18T01:00:00Z' },
              { id: 'c2', author_type: 'agent', author_id: 'a1', content: '## 完成：列表改造\r\n\r\n已完成列表改造。\r\n\r\n细节：…', created_at: '2026-10-18T03:00:00Z' },
              { id: 'c3', author_type: 'member', author_id: 'm1', content: '好的', created_at: '2026-10-18T04:00:00Z' }
            ]
          : []
    })
    const issues = await s.doneBetween({ start: '2026-10-17', end: '2026-10-23' })
    expect(issues.map((i) => [i.identifier, i.conclusion])).toEqual([
      ['JINB-3', null],
      ['JINB-2', '已完成列表改造。']
    ])
    expect(calls.find((c) => c.args[0] === 'issue' && c.args[1] === 'list')?.args).toContain('done')
  })
})

