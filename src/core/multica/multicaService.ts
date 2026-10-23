import type {
  MulticaAgent,
  MulticaComment,
  MulticaDispatchRequest,
  MulticaDispatchResult,
  MulticaIssue,
  MulticaIssueDetail,
  MulticaOverview,
  MulticaPrefs,
  MulticaProject,
  MulticaRuntime,
  MulticaWorkspace,
  TapdKind
} from '../../shared/types'
import { mapLimit } from '../concurrency'
import { AppError } from '../result'
import { matchProjects, type RawProject, type RepoRef } from './projectMatch'

export const MULTICA_WEB = 'https://multica.ai'
export const OPEN_STATUSES = ['in_progress', 'in_review', 'blocked', 'todo', 'backlog'] as const

const META_TTL_MS = 5 * 60_000
const PAGE_SIZE = 100
const MAX_PAGES = 20
const CONCURRENCY = 3
const ISSUE_FIELDS = 'id,identifier,title,status,assignee_type,assignee_id,project_id,updated_at,metadata'
const DEFAULT_WORKSPACE = 'jinbi'
const KIND_LABELS: Record<TapdKind, string> = { story: '需求', bug: '缺陷', task: '任务' }
const ASSIGNEE_FALLBACK: Record<string, string> = { member: '成员', squad: '小队', agent: '智能体' }

export interface MulticaCliLike {
  json<T>(args: string[], opts?: { workspaceId?: string; cwd?: string }): Promise<T>
  withTempFile<T>(content: string, fn: (name: string, cwd: string) => Promise<T>): Promise<T>
}

type RawIssue = {
  id: string
  identifier: string
  title: string
  status: string
  assignee_type?: string | null
  assignee_id?: string | null
  project_id?: string | null
  updated_at: string
  metadata?: Record<string, unknown> | null
  description?: string | null
}
type RawComment = { id: string; author_type: string; author_id: string; content: string; created_at: string }
type RawAgent = { id: string; name: string; archived_at?: string | null }
type RawRuntime = { id: string; name: string; provider: string; status: string; daemon_id?: string | null }
type RawDaemon = { status?: string; daemon_id?: string; running_task_count?: number }
type IssuePage = { issues: RawIssue[]; has_more?: boolean }

interface Meta {
  at: number
  workspace: MulticaWorkspace
  workspaces: MulticaWorkspace[]
  rawProjects: RawProject[]
  agents: MulticaAgent[]
  rawRuntimes: RawRuntime[]
}

interface Context {
  workspace: MulticaWorkspace
  agents: Map<string, string>
  projects: Map<string, MulticaProject>
}

export interface MulticaServiceDeps {
  repos: () => RepoRef[]
  prefs: () => MulticaPrefs
  now?: () => number
}

export function dispatchDescription(input: { repoPath: string | null; kind: TapdKind; url: string; body: string }): string {
  const parts = []
  if (input.repoPath) parts.push(`## 仓库\n\n\`${input.repoPath}\``)
  parts.push(`## 来源\n\nTAPD ${KIND_LABELS[input.kind]}：${input.url}`)
  parts.push(`## 描述\n\n${input.body.trim() || '（TAPD 正文为空）'}`)
  return `${parts.join('\n\n')}\n`
}

const normalizeText = (s: string | null | undefined) => (s ?? '').replace(/\r\n/g, '\n').trim()

export class MulticaService {
  private meta: Meta | null = null

  constructor(
    private readonly cli: MulticaCliLike,
    private readonly deps: MulticaServiceDeps
  ) {}

  reset(): void {
    this.meta = null
  }

  async overview(force: boolean): Promise<MulticaOverview> {
    if (force) this.meta = null
    const meta = await this.loadMeta()
    const ctx = this.context(meta)
    const wsId = meta.workspace.id
    const [daemon, issueLists] = await Promise.all([
      this.cli.json<RawDaemon>(['daemon', 'status']).catch(() => null),
      mapLimit(OPEN_STATUSES, CONCURRENCY, (status) => this.listIssues(wsId, ['--status', status]))
    ])
    const runtimes: MulticaRuntime[] = daemon?.daemon_id
      ? meta.rawRuntimes
          .filter((r) => r.daemon_id === daemon.daemon_id)
          .map((r) => ({ id: r.id, name: r.name, provider: r.provider, online: r.status === 'online' }))
      : []
    return {
      workspace: meta.workspace,
      workspaces: meta.workspaces,
      daemon: daemon ? { running: daemon.status === 'running', runningTasks: daemon.running_task_count ?? 0 } : null,
      runtimes,
      agents: meta.agents,
      projects: [...ctx.projects.values()],
      issues: issueLists.flat().map((raw) => this.toIssue(raw, ctx)),
      fetchedAt: (this.deps.now ?? Date.now)()
    }
  }

  async issue(id: string): Promise<Omit<MulticaIssueDetail, 'card'>> {
    const meta = await this.loadMeta()
    const ctx = this.context(meta)
    const wsId = meta.workspace.id
    const [raw, rawComments] = await Promise.all([
      this.cli.json<RawIssue>(['issue', 'get', id], { workspaceId: wsId }),
      this.cli.json<RawComment[]>(['issue', 'comment', 'list', id, '--compact'], { workspaceId: wsId })
    ])
    const comments: MulticaComment[] = [...(rawComments ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => ({
        id: c.id,
        authorType: c.author_type,
        authorName: (c.author_type === 'agent' && ctx.agents.get(c.author_id)) || ASSIGNEE_FALLBACK[c.author_type] || c.author_type,
        content: normalizeText(c.content),
        createdAt: c.created_at
      }))
    const conclusion = [...comments].reverse().find((c) => c.authorType === 'agent')?.content ?? null
    return { issue: this.toIssue(raw, ctx), description: normalizeText(raw.description), comments, conclusion }
  }

  async project(projectId: string): Promise<MulticaProject | null> {
    return this.context(await this.loadMeta()).projects.get(projectId) ?? null
  }

  async findByTapd(tapdKey: string): Promise<MulticaIssue | null> {
    const meta = await this.loadMeta()
    const page = await this.cli.json<IssuePage>(
      ['issue', 'list', '--metadata', `tapd_key=${tapdKey}`, '--limit', '5', '--fields', ISSUE_FIELDS],
      { workspaceId: meta.workspace.id }
    )
    const raw = page?.issues?.[0]
    return raw ? this.toIssue(raw, this.context(meta)) : null
  }

  async dispatch(req: MulticaDispatchRequest, description: string): Promise<MulticaDispatchResult> {
    const existing = await this.findByTapd(req.tapdKey)
    if (existing) throw new AppError('MULTICA_ALREADY_DISPATCHED', `已经派过单：${existing.identifier}`)
    const meta = await this.loadMeta()
    const wsId = meta.workspace.id
    const raw = await this.cli.withTempFile(description, (name, cwd) =>
      this.cli.json<RawIssue>(
        [
          'issue',
          'create',
          '--title',
          req.title,
          '--description-file',
          name,
          ...(req.projectId ? ['--project', req.projectId] : []),
          ...(req.agentId ? ['--assignee-id', req.agentId] : [])
        ],
        { workspaceId: wsId, cwd }
      )
    )
    const issue = this.toIssue({ ...raw, metadata: { ...raw.metadata, tapd_key: req.tapdKey } }, this.context(meta))
    try {
      await this.cli.json(['issue', 'metadata', 'set', raw.id, '--key', 'tapd_key', '--value', req.tapdKey, '--type', 'string'], {
        workspaceId: wsId
      })
      return { issue }
    } catch {
      return { issue, warning: `已创建 ${raw.identifier}，但未写入 TAPD 关联，之后无法按 TAPD 单号去重` }
    }
  }

  async comment(id: string, text: string): Promise<void> {
    const meta = await this.loadMeta()
    const wsId = meta.workspace.id
    const raw = await this.cli.json<RawIssue>(['issue', 'get', id], { workspaceId: wsId })
    const agentName = raw.assignee_type === 'agent' && raw.assignee_id ? this.context(meta).agents.get(raw.assignee_id) : undefined
    const body = agentName ? `${text.trim()}\n\n[@${agentName}](mention://agent/${raw.assignee_id})` : text.trim()
    await this.cli.withTempFile(body, (name, cwd) =>
      this.cli.json(['issue', 'comment', 'add', id, '--content-file', name], { workspaceId: wsId, cwd })
    )
  }

  async complete(id: string): Promise<void> {
    const meta = await this.loadMeta()
    await this.cli.json(['issue', 'status', id, 'done', '--no-start'], { workspaceId: meta.workspace.id })
  }

  private async listIssues(workspaceId: string, filter: string[]): Promise<RawIssue[]> {
    const all: RawIssue[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.cli.json<IssuePage>(
        ['issue', 'list', ...filter, '--limit', String(PAGE_SIZE), '--offset', String(page * PAGE_SIZE), '--fields', ISSUE_FIELDS],
        { workspaceId }
      )
      all.push(...(res?.issues ?? []))
      if (!res?.has_more) break
    }
    return all
  }

  private async loadMeta(): Promise<Meta> {
    const now = (this.deps.now ?? Date.now)()
    const wanted = this.deps.prefs().workspaceId
    if (this.meta && now - this.meta.at < META_TTL_MS && (!wanted || this.meta.workspace.id === wanted)) return this.meta
    const workspaces = (await this.cli.json<MulticaWorkspace[]>(['workspace', 'list', '--full-id'])) ?? []
    const workspace =
      workspaces.find((w) => w.id === wanted) ?? workspaces.find((w) => w.slug === DEFAULT_WORKSPACE || w.name === DEFAULT_WORKSPACE) ?? workspaces[0]
    if (!workspace) throw new AppError('MULTICA_NO_WORKSPACE', 'multica 账号下没有工作区')
    const opts = { workspaceId: workspace.id }
    const [rawProjects, rawAgents, rawRuntimes] = await Promise.all([
      this.cli.json<RawProject[]>(['project', 'list'], opts),
      this.cli.json<RawAgent[]>(['agent', 'list'], opts),
      this.cli.json<RawRuntime[]>(['runtime', 'list'], opts)
    ])
    this.meta = {
      at: now,
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug })),
      rawProjects: rawProjects ?? [],
      agents: (rawAgents ?? []).filter((a) => !a.archived_at).map((a) => ({ id: a.id, name: a.name })),
      rawRuntimes: rawRuntimes ?? []
    }
    return this.meta
  }

  /** 项目对应依赖仓库映射和手工设置，每次现算 */
  private context(meta: Meta): Context {
    const matches = matchProjects(meta.rawProjects, this.deps.repos(), this.deps.prefs().projectMap ?? {})
    const projects = new Map<string, MulticaProject>(
      meta.rawProjects.map((p) => {
        const m = matches.get(p.id) ?? { repoId: null, matchedBy: null }
        return [p.id, { id: p.id, title: p.title, ...m }]
      })
    )
    return { workspace: meta.workspace, agents: new Map(meta.agents.map((a) => [a.id, a.name])), projects }
  }

  private toIssue(raw: RawIssue, ctx: Context): MulticaIssue {
    const type = (raw.assignee_type ?? null) as MulticaIssue['assigneeType']
    const project = raw.project_id ? ctx.projects.get(raw.project_id) : undefined
    const tapdKey = raw.metadata?.tapd_key
    return {
      id: raw.id,
      identifier: raw.identifier,
      title: raw.title,
      status: raw.status,
      assigneeType: type,
      assigneeId: raw.assignee_id ?? null,
      assigneeName: type ? ((type === 'agent' && raw.assignee_id && ctx.agents.get(raw.assignee_id)) || ASSIGNEE_FALLBACK[type]) : null,
      projectId: raw.project_id ?? null,
      projectTitle: project?.title ?? null,
      repoId: project?.repoId ?? null,
      updatedAt: raw.updated_at,
      url: `${MULTICA_WEB}/${ctx.workspace.slug}/issues/${raw.identifier}`,
      tapdKey: typeof tapdKey === 'string' ? tapdKey : null
    }
  }
}
