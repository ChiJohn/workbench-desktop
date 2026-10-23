import type { TapdBoard, TapdItem, TapdKind, TapdTransition, TapdWorkspace } from '../../shared/types'
import { mapLimit } from '../concurrency'
import { AppError, toErrorInfo } from '../result'
import {
  hasOwner,
  htmlToText,
  normalizeBug,
  normalizeStory,
  normalizeTask,
  TASK_STATUS_LABELS,
  type NormalizeContext,
  type Raw
} from './normalize'
import type { TapdClient } from './tapdClient'

const WORKSPACE_CONCURRENCY = 3
const ITERATION_CHUNK = 30
const EXCLUDED_WORKSPACE_NAMES = new Set(['示例空间'])

const ENTITY: Record<TapdKind, { path: string; entity: string; ownerParam: string; ownerField: string; fields: string }> = {
  story: {
    path: '/stories',
    entity: 'Story',
    ownerParam: 'owner',
    ownerField: 'owner',
    fields: 'id,workspace_id,name,status,iteration_id,owner,priority,priority_label,modified,workitem_type_id'
  },
  bug: {
    path: '/bugs',
    entity: 'Bug',
    ownerParam: 'current_owner',
    ownerField: 'current_owner',
    fields: 'id,workspace_id,title,status,iteration_id,current_owner,priority,priority_label,modified'
  },
  task: {
    path: '/tasks',
    entity: 'Task',
    ownerParam: 'owner',
    ownerField: 'owner',
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

export interface TapdServiceOptions {
  disabledWorkspaces: () => string[]
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
    private readonly opts: TapdServiceOptions
  ) {}

  /** 令牌变化时调用 */
  reset(): void {
    this.user = null
    this.workspaces = null
    this.clearMeta()
    this.items = new Map()
  }

  async board(force = false): Promise<TapdBoard> {
    if (force) {
      this.workspaces = null
      this.clearMeta()
    }
    const user = await this.currentUser()
    const all = await this.participantWorkspaces(user)
    const disabled = new Set(this.opts.disabledWorkspaces())
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

  item(key: string): TapdItem {
    const item = this.items.get(key)
    if (!item) throw new AppError('TAPD_ITEM_NOT_FOUND', '单子不在当前看板中，请刷新后重试', key)
    return item
  }

  async detail(key: string): Promise<{ item: TapdItem; description: string; transitions: TapdTransition[] }> {
    const item = this.item(key)
    const { path, entity } = ENTITY[item.kind]
    const [rows, transitions] = await Promise.all([
      this.client.get<Record<string, Raw>[]>(path, { workspace_id: item.workspaceId, id: item.id, fields: 'id,description' }),
      this.allowedTransitions(item)
    ])
    const description = htmlToText(rows?.[0]?.[entity]?.description)
    return { item, description, transitions }
  }

  async transition(key: string, to: string): Promise<void> {
    const item = this.item(key)
    const target = (await this.allowedTransitions(item)).find((t) => t.to === to)
    if (!target || target.blockedBy.length) {
      const reason = target ? `需要在 TAPD 中填写：${target.blockedBy.join('、')}` : '工作流不允许流转到该状态'
      throw new AppError('TAPD_TRANSITION_NOT_ALLOWED', reason, `${key} → ${to}`)
    }
    await this.client.post(ENTITY[item.kind].path, {
      workspace_id: item.workspaceId,
      id: item.id,
      status: to,
      current_user: await this.currentUser()
    })
    this.items.set(key, { ...item, status: to, statusLabel: target.label })
  }

  private clearMeta(): void {
    this.meta.clear()
    this.iterations.clear()
    this.transitions.clear()
  }

  private async currentUser(): Promise<string> {
    if (!this.user) this.user = (await this.client.get<{ nick: string }>('/users/info')).nick
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
      const rows = await this.client.listAll(e.path, { workspace_id: ws.id, [e.ownerParam]: nick, fields: e.fields }, e.entity)
      return rows
        .map((r): Raw => ({ ...r, workspace_id: r.workspace_id ?? ws.id }))
        .filter((r) => hasOwner(r[e.ownerField], nick))
        .filter((r) => {
          const status = r.status ?? ''
          return kind === 'task' ? status !== 'done' : !meta[kind].final.has(status)
        })
    }
    const [stories, bugs, tasks] = await Promise.all([fetchKind('story'), fetchKind('bug'), fetchKind('task')])
    await this.loadIterations(ws.id, [...stories, ...bugs, ...tasks].map((r) => r.iteration_id))

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
      for (const r of rows ?? []) this.iterations.set(String(r.Iteration.id), r.Iteration.name ?? '')
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
        label: labels[t.StepNext!],
        blockedBy: (t.Appendfield ?? [])
          .filter((f) => f.Notnull === 'yes' && !(f.DefaultValue && f.DefaultValue.length))
          .map((f) => f.FieldLabel || f.FieldName || '未知字段')
      }))
  }
}
