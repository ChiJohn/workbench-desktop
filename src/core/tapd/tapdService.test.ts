import { beforeEach, describe, expect, it } from 'vitest'
import { TapdClient } from './tapdClient'
import { TapdService } from './tapdService'

const ME = '陈志强'

interface Call {
  method: string
  path: string
  params: Record<string, string>
}

/** 一个按路径路由的假 TAPD；fail 中的项目返回错误 */
function fakeTapd(fail: string[] = []) {
  const calls: Call[] = []
  const ok = (data: unknown) => new Response(JSON.stringify({ status: 1, data, info: 'success' }))
  const wrap = (entity: string, rows: object[]) => rows.map((r) => ({ [entity]: r }))
  const fn = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input)
    const params = Object.fromEntries(
      init.method === 'POST' ? new URLSearchParams(String(init.body)) : url.searchParams
    ) as Record<string, string>
    calls.push({ method: init.method ?? 'GET', path: url.pathname, params })
    const ws = params.workspace_id
    if (ws && fail.includes(ws)) return new Response(JSON.stringify({ status: 0, info: '无权限' }))
    switch (url.pathname) {
      case '/users/info':
        return ok({ nick: ME })
      case '/workspaces/user_participant_projects':
        return ok([
          { Workspace: { id: '1', name: '多经项目', category: 'project' } },
          { Workspace: { id: '2', name: '白驹充电', category: 'project' } },
          { Workspace: { id: '3', name: '物业集团', category: 'organization' } },
          { Workspace: { id: '4', name: '示例空间', category: 'mini_project' } }
        ])
      case '/workflows/status_map':
        return ok(params.system === 'story' ? { status_4: '未启动', status_6: '研发中', status_8: '已上线' } : { new: '新', closed: '已关闭' })
      case '/workflows/last_steps':
        return ok(params.system === 'story' ? { status_8: '已上线' } : { closed: '已关闭' })
      case '/iterations':
        return ok(params.id.split(',').map((id) => ({ Iteration: { id, name: `迭代${id}` } })))
      case '/stories':
        if (params.id) return ok(wrap('Story', [{ id: params.id, description: '<p>正文</p>' }]))
        return ok(
          wrap('Story', [
            { id: `${ws}01`, workspace_id: ws, name: '未启动需求', status: 'status_4', owner: `a;${ME};`, iteration_id: 'it1', modified: '2026-10-23 10:00:00', workitem_type_id: 'wt' },
            { id: `${ws}02`, workspace_id: ws, name: '已上线需求', status: 'status_8', owner: `${ME};`, iteration_id: 'it1', modified: '2026-10-22 10:00:00' },
            { id: `${ws}03`, workspace_id: ws, name: '模糊匹配', status: 'status_4', owner: `${ME}2;`, iteration_id: '0', modified: '2026-10-21 10:00:00' }
          ])
        )
      case '/bugs':
        return ok(
          wrap('Bug', [
            { id: `${ws}11`, workspace_id: ws, title: '新缺陷', status: 'new', current_owner: `${ME};`, iteration_id: '0', modified: '2026-10-24 09:00:00' },
            { id: `${ws}12`, workspace_id: ws, title: '已关闭', status: 'closed', current_owner: `${ME};`, iteration_id: '0', modified: '2026-10-20 09:00:00' }
          ])
        )
      case '/tasks':
        return ok(
          wrap('Task', [
            { id: `${ws}21`, name: '进行中任务', status: 'progressing', owner: `${ME};`, iteration_id: 'it2', story_id: `${ws}01`, modified: '2026-10-23 11:00:00' },
            { id: `${ws}22`, name: '已完成任务', status: 'done', owner: `${ME};`, iteration_id: 'it2', modified: '2026-10-23 12:00:00' }
          ])
        )
      case '/workflows/all_transitions':
        return ok([
          { StepPrevious: 'status_4', StepNext: 'status_6', Appendfield: [{ FieldName: 'owner', Notnull: 'no' }] },
          { StepPrevious: 'status_4', StepNext: 'status_8', Appendfield: [{ FieldName: 'version', FieldLabel: '版本', Notnull: 'yes' }] },
          { StepPrevious: 'status_4', StepNext: 'status_4', Appendfield: [] },
          { StepPrevious: 'status_6', StepNext: 'end', Appendfield: [] }
        ])
    }
    return new Response(JSON.stringify({ status: 0, info: `unknown ${url.pathname}` }))
  }) as unknown as typeof fetch
  return { fn, calls }
}

let tapd: ReturnType<typeof fakeTapd>
let disabled: string[]
let service: TapdService

const make = (fail: string[] = []) => {
  tapd = fakeTapd(fail)
  disabled = []
  service = new TapdService(new TapdClient({ token: () => 't', fetch: tapd.fn }), { disabledWorkspaces: () => disabled })
}

beforeEach(() => make())

describe('TapdService.board', () => {
  it('collects my unfinished items across enabled workspaces', async () => {
    const board = await service.board()
    expect(board.user).toBe(ME)
    expect(board.workspaces).toEqual([
      { id: '1', name: '多经项目', enabled: true },
      { id: '2', name: '白驹充电', enabled: true }
    ])
    expect(board.errors).toEqual([])
    const ws1 = board.items.filter((i) => i.workspaceId === '1')
    expect(ws1.map((i) => i.title)).toEqual(['新缺陷', '进行中任务', '未启动需求'])
    const story = ws1.find((i) => i.kind === 'story')
    expect(story).toMatchObject({ statusLabel: '未启动', iterationName: '迭代it1', workspaceName: '多经项目' })
    expect(ws1.find((i) => i.kind === 'task')).toMatchObject({ workspaceId: '1', statusLabel: '进行中', storyId: '101' })
  })

  it('caches metadata between refreshes and clears it on force', async () => {
    await service.board()
    const metaCalls = () => tapd.calls.filter((c) => c.path.startsWith('/workflows') || c.path === '/iterations').length
    const first = metaCalls()
    await service.board()
    expect(metaCalls()).toBe(first)
    await service.board(true)
    expect(metaCalls()).toBe(first * 2)
  })

  it('skips disabled workspaces and isolates failures', async () => {
    make(['2'])
    let board = await service.board()
    expect(board.errors).toEqual([{ workspaceId: '2', workspaceName: '白驹充电', message: 'TAPD：无权限' }])
    expect(board.items.every((i) => i.workspaceId === '1')).toBe(true)
    disabled = ['1']
    board = await service.board()
    expect(board.workspaces.find((w) => w.id === '1')?.enabled).toBe(false)
    expect(tapd.calls.filter((c) => c.path === '/stories' && c.params.workspace_id === '1')).toHaveLength(1)
  })
})

describe('TapdService.detail and transition', () => {
  it('returns the description and allowed transitions', async () => {
    await service.board()
    const detail = await service.detail('story:101')
    expect(detail.description).toBe('正文')
    expect(detail.transitions).toEqual([
      { to: 'status_6', label: '研发中', blockedBy: [] },
      { to: 'status_8', label: '已上线', blockedBy: ['版本'] }
    ])
  })

  it('offers fixed transitions for tasks', async () => {
    await service.board()
    const detail = await service.detail('task:121')
    expect(detail.transitions.map((t) => t.to)).toEqual(['open', 'done'])
  })

  it('posts an allowed transition and rejects others', async () => {
    await service.board()
    await service.transition('story:101', 'status_6')
    const post = tapd.calls.find((c) => c.method === 'POST')
    expect(post).toEqual({
      method: 'POST',
      path: '/stories',
      params: { workspace_id: '1', id: '101', status: 'status_6', current_user: ME }
    })
    await expect(service.transition('story:101', 'status_8')).rejects.toMatchObject({ code: 'TAPD_TRANSITION_NOT_ALLOWED' })
    await expect(service.transition('story:101', 'status_99')).rejects.toMatchObject({ code: 'TAPD_TRANSITION_NOT_ALLOWED' })
    expect(tapd.calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  it('requires the item to be on the board', async () => {
    await expect(service.detail('story:nope')).rejects.toMatchObject({ code: 'TAPD_ITEM_NOT_FOUND' })
  })
})
