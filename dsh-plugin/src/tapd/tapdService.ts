import type { TapdBoard, TapdDetail, TapdHistoryItem, TapdItem, TapdKind, TapdTransition, TapdWorkspace } from '../types.js'
import { AppError, toErrorInfo } from '../util/result.js'
import {
  hasOwner,
  htmlToText,
  splitOwners,
  normalizeBug,
  normalizeStory,
  normalizeTask,
  TASK_STATUS_LABELS,
  type NormalizeContext,
  type Raw
} from './normalize.js'
import type { TapdClient } from './tapdClient.js'

const WORKSPACE_CONCURRENCY = 3
const ITERATION_CHUNK = 30
const EXCLUDED_WORKSPACE_NAMES = new Set(['示例空间'])

const COMMENT_TYPE: Record<TapdKind, string> = { story: 'stories', bug: 'bug_remark', task: 'tasks' }

function commentHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<p>${escaped.replace(/\r?\n/g, '<br>')}</p>`
}

const ENTITY: Record<
  TapdKind,
  {
    path: string
    entity: string
    ownerParam: string
    ownerField: string
    creatorField: string
    fields: string
  }
> = {
  story: {
    path: '/stories',
    entity: 'Story',
    ownerParam: 'owner',
    ownerField: 'owner',
    creatorField: 'creator',
    fields: 'id,workspace_id,name,status,iteration_id,owner,priority,priority_label,modified,workitem_type_id'
  },
  bug: {
    path: '/bugs',
    entity: 'Bug',
    ownerParam: 'current_owner',
    ownerField: 'current_owner',
    creatorField: 'reporter',
    fields: 'id,workspace_id,title,status,iteration_id,current_owner,priority,priority_label,modified'
  },
  task: {
    path: '/tasks',
    entity: 'Task',
    ownerParam: 'owner',
    ownerField: 'owner',
    creatorField: 'creator',
    fields: 'id,workspace_id,name,status,iteration_id,owner,priority,priority_label,story_id,modified'
  }
}

interface WorkflowMeta {
  labels: Record<string, string>
  final: Set<string>
}

interface WorkspaceMeta {
  story: WorkflowMeta
  bug: WorkflowMeta
}

interface RawTransition {
  StepPrevious?: string
  StepNext?: string
  Appendfield?: { FieldName?: string; FieldLabel?: string; Notnull?: string; DefaultValue?: unknown[] }[]
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      const item = items[i]!
      results[i] = await fn(item, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export interface TapdServiceOptions {
  disabledWorkspaces?: () => string[]
}

export class TapdService {
  private user: string | null = null
  private workspaces: { id: string; name: string }[] | null = null
  private readonly meta = new Map<string, WorkspaceMeta>()
  private readonly iterations = new Map<string, string>()
  private readonly transitions = new Map<string, RawTransition[]>()
  private items = new Map<string, TapdItem>()

  constructor(
    private readonly client: TapdClient,
    private readonly opts: TapdServiceOptions = {}
  ) {}

  reset(): void {
    this.user = null
    this.workspaces = null
    this.meta.clear()
    this.iterations.clear()
    this.transitions.clear()
    this.items = new Map()
  }

  async board(force = false): Promise<TapdBoard> {
    if (force) {
      this.workspaces = null
      this.meta.clear()
    }
    const user = await this.currentUser()
    const all = await this.participantWorkspaces(user)
    const disabled = new Set(this.opts.disabledWorkspaces?.() ?? [])
    const workspaces: TapdWorkspace[] = all.map((w) => ({ ...w, enabled: !disabled.has(w.id) }))
    const enabled = workspaces.filter((w) => w.enabled)

    const results = await mapLimit(enabled, WORKSPACE_CONCURRENCY, async (ws) => {
      try {
        return { items: await this.workspaceItems(ws, user) }
      } catch (e) {
        return { error: { workspaceId: ws.id, workspaceName: ws.name, message: toErrorInfo(e).message } }
      }
    })
    const items = results.flatMap((r) => r.items ?? []).sort((a, b) => b.modified.localeCompare(a.modified))
    this.items = new Map(items.map((i) => [i.key, i]))
    return {
      user,
      items,
      workspaces,
      errors: results.flatMap((r) => (r.error ? [r.error] : [])),
      fetchedAt: Date.now()
    }
  }

  async nick(): Promise<string> {
    return this.currentUser()
  }

  /** 查询指定时间段内有修改/已完成的经办任务 */
  async history(range: { start: string; end: string }): Promise<{ items: TapdHistoryItem[]; errors: TapdBoard['errors'] }> {
    const user = await this.currentUser()
    const disabled = new Set(this.opts.disabledWorkspaces?.() ?? [])
    const enabled = (await this.participantWorkspaces(user)).filter((w) => !disabled.has(w.id))
    const results = await mapLimit(enabled, WORKSPACE_CONCURRENCY, async (ws) => {
      try {
        return { items: await this.workspaceHistory(ws, user, `${range.start}~${range.end}`) }
      } catch (e) {
        return { error: { workspaceId: ws.id, workspaceName: ws.name, message: toErrorInfo(e).message } }
      }
    })
    return {
      items: results.flatMap((r) => r.items ?? []).sort((a, b) => b.modified.localeCompare(a.modified)),
      errors: results.flatMap((r) => (r.error ? [r.error] : []))
    }
  }

  async findItem(keyOrId: string): Promise<TapdItem | undefined> {
    // 1. 精确匹配 key (e.g. story:1016729)
    if (this.items.has(keyOrId)) return this.items.get(keyOrId)
    // 2. 按 id 匹配
    for (const item of this.items.values()) {
      if (item.id === keyOrId) return item
    }
    // 3. 看板可能尚未加载，尝试拉取一次
    if (this.items.size === 0) {
      await this.board()
      if (this.items.has(keyOrId)) return this.items.get(keyOrId)
      for (const item of this.items.values()) {
        if (item.id === keyOrId) return item
      }
    }
    return undefined
  }

  async detail(keyOrId: string): Promise<TapdDetail> {
    const item = await this.findItem(keyOrId)
    if (!item) {
      throw new AppError('TAPD_ITEM_NOT_FOUND', `未找到单号为 ${keyOrId} 的 TAPD 任务或缺陷，请先列出待办列表核对`)
    }
    const { path, entity } = ENTITY[item.kind]
    const [rows, transitions] = await Promise.all([
      this.client.get<Record<string, Raw>[]>(path, {
        workspace_id: item.workspaceId,
        id: item.id,
        fields: 'id,description'
      }),
      this.allowedTransitions(item)
    ])
    const description = htmlToText(rows?.[0]?.[entity]?.description)
    return { item, description, transitions }
  }

  async transition(keyOrId: string, to: string, comment?: string): Promise<{ item: TapdItem; commentAdded: boolean }> {
    const item = await this.findItem(keyOrId)
    if (!item) {
      throw new AppError('TAPD_ITEM_NOT_FOUND', `未找到单号为 ${keyOrId} 的 TAPD 任务或缺陷`)
    }
    const target = (await this.allowedTransitions(item)).find((t) => t.to === to || t.label === to)
    if (!target || target.blockedBy.length) {
      const reason = target ? `需要在 TAPD 网页端填写必填字段：${target.blockedBy.join('、')}` : `当前状态不可流转到「${to}」`
      throw new AppError('TAPD_TRANSITION_NOT_ALLOWED', reason, `${item.key} → ${to}`)
    }
    const entity = ENTITY[item.kind]
    const author = await this.currentUser()
    const body: Record<string, string> = {
      workspace_id: item.workspaceId,
      id: item.id,
      status: target.to,
      current_user: author
    }
    let owners = item.owners
    if (target.label === '已解决') {
      const creator = await this.creatorOf(item)
      if (creator) {
        body[entity.ownerField] = creator
        owners = [creator]
      }
    }
    await this.client.post(entity.path, body)
    const updatedItem: TapdItem = { ...item, status: target.to, statusLabel: target.label, owners }
    this.items.set(item.key, updatedItem)

    let commentAdded = false
    const remark = comment?.trim()
    if (remark) {
      try {
        await this.client.post('/comments', {
          workspace_id: item.workspaceId,
          entry_type: COMMENT_TYPE[item.kind],
          entry_id: item.id,
          author,
          description: commentHtml(remark)
        })
        commentAdded = true
      } catch (e) {
        const info = toErrorInfo(e)
        throw new AppError('TAPD_COMMENT_FAILED', `状态已改为「${target.label}」，但添加备注失败：${info.message}`, info.detail)
      }
    }
    return { item: updatedItem, commentAdded }
  }

  private async creatorOf(item: TapdItem): Promise<string | null> {
    const entity = ENTITY[item.kind]
    const rows = await this.client.get<Record<string, Raw>[]>(entity.path, {
      workspace_id: item.workspaceId,
      id: item.id,
      fields: `id,${entity.creatorField}`
    })
    const raw = rows?.map((row) => row[entity.entity]).find((row) => String(row?.id) === item.id)
    return splitOwners(raw?.[entity.creatorField])[0] ?? null
  }

  private async currentUser(): Promise<string> {
    if (!this.user) {
      this.user = (await this.client.get<{ nick: string }>('/users/info')).nick
    }
    return this.user
  }

  private async participantWorkspaces(nick: string): Promise<{ id: string; name: string }[]> {
    if (!this.workspaces) {
      const rows = await this.client.get<{ Workspace: Raw }[]>('/workspaces/user_participant_projects', { nick })
      this.workspaces = rows
        .map((r) => r.Workspace)
        .filter((w) => w.category !== 'organization' && !EXCLUDED_WORKSPACE_NAMES.has(w.name ?? ''))
        .map((w) => ({ id: String(w.id), name: w.name ?? String(w.id) }))
    }
    return this.workspaces
  }

  private async workspaceMeta(ws: string): Promise<WorkspaceMeta> {
    let meta = this.meta.get(ws)
    if (!meta) {
      const load = async (system: 'story' | 'bug'): Promise<WorkflowMeta> => {
        const [labels, final] = await Promise.all([
          this.client.get<Record<string, string>>('/workflows/status_map', { workspace_id: ws, system }),
          this.client.get<Record<string, string>>('/workflows/last_steps', { workspace_id: ws, system })
        ])
        return { labels: labels ?? {}, final: new Set(Object.keys(final ?? {})) }
      }
      const [story, bug] = await Promise.all([load('story'), load('bug')])
      meta = { story, bug }
      this.meta.set(ws, meta)
    }
    return meta
  }

  private async workspaceItems(ws: { id: string; name: string }, nick: string): Promise<TapdItem[]> {
    const meta = await this.workspaceMeta(ws.id)
    const fetchKind = async (kind: TapdKind) => {
      const e = ENTITY[kind]
      const rows = await this.client.listAll(
        e.path,
        { workspace_id: ws.id, [e.ownerParam]: nick, fields: e.fields },
        e.entity
      )
      return rows
        .map((r): Raw => ({ ...r, workspace_id: r.workspace_id ?? ws.id }))
        .filter((r) => hasOwner(r[e.ownerField], nick))
        .filter((r) => {
          const status = r.status ?? ''
          return kind === 'task' ? status !== 'done' : !meta[kind].final.has(status)
        })
    }
    const [stories, bugs, tasks] = await Promise.all([fetchKind('story'), fetchKind('bug'), fetchKind('task')])
    await this.loadIterations(
      ws.id,
      [...stories, ...bugs, ...tasks].map((r) => r.iteration_id)
    )

    const ctx = (labels: Record<string, string>): NormalizeContext => ({
      workspaceName: ws.name,
      statusLabels: labels,
      iterations: Object.fromEntries(this.iterations)
    })
    return [
      ...stories.map((r) => normalizeStory(r, ctx(meta.story.labels))),
      ...bugs.map((r) => normalizeBug(r, ctx(meta.bug.labels))),
      ...tasks.map((r) => normalizeTask(r, ctx(TASK_STATUS_LABELS)))
    ]
  }

  private async workspaceHistory(ws: { id: string; name: string }, nick: string, modified: string): Promise<TapdHistoryItem[]> {
    const meta = await this.workspaceMeta(ws.id)
    const query = async (kind: TapdKind, ownerParam: string, fields: string) => {
      const e = ENTITY[kind]
      const rows = await this.client.listAll(e.path, { workspace_id: ws.id, [ownerParam]: nick, modified, fields }, e.entity)
      return rows.map((r): Raw => ({ ...r, workspace_id: r.workspace_id ?? ws.id }))
    }
    const bugFields = `${ENTITY.bug.fields},fixer`
    const [stories, tasks, fixed, owned] = await Promise.all([
      query('story', 'owner', ENTITY.story.fields),
      query('task', 'owner', ENTITY.task.fields),
      query('bug', 'fixer', bugFields),
      query('bug', 'current_owner', bugFields)
    ])
    const bugs = [...new Map([...fixed, ...owned].map((r) => [r.id, r])).values()].filter(
      (r) => hasOwner(r.fixer, nick) || hasOwner(r.current_owner, nick)
    )
    const mine = {
      story: stories.filter((r) => hasOwner(r.owner, nick)),
      task: tasks.filter((r) => hasOwner(r.owner, nick))
    }
    await this.loadIterations(ws.id, [...mine.story, ...bugs, ...mine.task].map((r) => r.iteration_id))
    const ctx = (labels: Record<string, string>): NormalizeContext => ({
      workspaceName: ws.name,
      statusLabels: labels,
      iterations: Object.fromEntries(this.iterations)
    })
    return [
      ...mine.story.map((r) => ({ ...normalizeStory(r, ctx(meta.story.labels)), done: meta.story.final.has(r.status ?? '') })),
      ...bugs.map((r) => ({ ...normalizeBug(r, ctx(meta.bug.labels)), done: meta.bug.final.has(r.status ?? '') })),
      ...mine.task.map((r) => ({ ...normalizeTask(r, ctx(TASK_STATUS_LABELS)), done: r.status === 'done' }))
    ]
  }

  private async loadIterations(ws: string, ids: (string | null | undefined)[]): Promise<void> {
    const missing = [...new Set(ids.filter((id): id is string => Boolean(id) && id !== '0'))].filter(
      (id) => !this.iterations.has(id)
    )
    for (let i = 0; i < missing.length; i += ITERATION_CHUNK) {
      const chunk = missing.slice(i, i + ITERATION_CHUNK)
      const rows = await this.client.get<{ Iteration: Raw }[]>('/iterations', {
        workspace_id: ws,
        id: chunk.join(','),
        fields: 'id,name'
      })
      for (const r of rows ?? []) {
        this.iterations.set(String(r.Iteration.id), r.Iteration.name ?? '')
      }
    }
  }

  private async allowedTransitions(item: TapdItem): Promise<TapdTransition[]> {
    if (item.kind === 'task') {
      return Object.entries(TASK_STATUS_LABELS)
        .filter(([to]) => to !== item.status)
        .map(([to, label]) => ({ to, label, blockedBy: [] }))
    }
    const system = item.kind
    const cacheKey = `${item.workspaceId}:${system}:${item.workitemTypeId ?? ''}`
    let rows = this.transitions.get(cacheKey)
    if (!rows) {
      rows = await this.client.get<RawTransition[]>('/workflows/all_transitions', {
        workspace_id: item.workspaceId,
        system,
        workitem_type_id: item.workitemTypeId
      })
      this.transitions.set(cacheKey, rows ?? [])
    }
    const labels = (await this.workspaceMeta(item.workspaceId))[system].labels
    const seen = new Set<string>()
    return (rows ?? [])
      .filter((t) => t.StepPrevious === item.status && t.StepNext && t.StepNext !== item.status && t.StepNext in labels)
      .filter((t) => !seen.has(t.StepNext!) && seen.add(t.StepNext!))
      .map((t) => ({
        to: t.StepNext!,
        label: labels[t.StepNext!] ?? t.StepNext!,
        blockedBy: (t.Appendfield ?? [])
          .filter((f) => f.Notnull === 'yes' && !(f.DefaultValue && f.DefaultValue.length))
          .map((f) => f.FieldLabel || f.FieldName || '未知字段')
      }))
  }
}
