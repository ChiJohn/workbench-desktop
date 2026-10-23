import type { TapdItem, TapdKind } from '../../shared/types'

export const TAPD_WEB = 'https://www.tapd.cn'

export const TASK_STATUS_LABELS: Record<string, string> = { open: '未开始', progressing: '进行中', done: '已完成' }

export type Raw = Record<string, string | null | undefined>

export interface NormalizeContext {
  workspaceName: string
  statusLabels: Record<string, string>
  iterations: Record<string, string>
}

export function splitOwners(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 接口按模糊匹配处理人，需要本地精确复核 */
export function hasOwner(value: string | null | undefined, nick: string): boolean {
  return splitOwners(value).includes(nick)
}

export function itemUrl(kind: TapdKind, workspaceId: string, id: string): string {
  const path = kind === 'bug' ? 'bugtrace/bugs' : kind === 'story' ? 'prong/stories' : 'prong/tasks'
  return `${TAPD_WEB}/${workspaceId}/${path}/view/${id}`
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }

function decode(text: string): string {
  return text.replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ENTITIES[e])
}

function absolute(src: string): string {
  return src.startsWith('/') ? `${TAPD_WEB}${src}` : src
}

/** TAPD 正文是富文本 HTML，这里只保留阅读需要的结构 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  const text = html
    .replace(/\r?\n/g, '')
    .replace(/<img\b[^>]*\bsrc="([^"]*)"[^>]*>/gi, (_, src: string) => `[图片] ${absolute(decode(src))}`)
    .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
      const url = decode(href)
      const label = decode(inner.replace(/<[^>]+>/g, '')).trim()
      return !label || label === url ? url : `${label}（${url}）`
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|table|tr|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
  return decode(text)
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function iteration(raw: Raw, ctx: NormalizeContext) {
  const id = raw.iteration_id && raw.iteration_id !== '0' ? raw.iteration_id : null
  return { iterationId: id, iterationName: id ? (ctx.iterations[id] ?? null) : null }
}

function base(kind: TapdKind, raw: Raw, ctx: NormalizeContext, title: string, owners: string, labels: Record<string, string>): TapdItem {
  const id = String(raw.id)
  const workspaceId = String(raw.workspace_id)
  const status = raw.status ?? ''
  return {
    key: `${kind}:${id}`,
    kind,
    id,
    workspaceId,
    workspaceName: ctx.workspaceName,
    title,
    status,
    statusLabel: labels[status] ?? status,
    ...iteration(raw, ctx),
    owners: splitOwners(owners),
    priority: raw.priority_label || raw.priority || null,
    modified: raw.modified ?? '',
    url: itemUrl(kind, workspaceId, id)
  }
}

export function normalizeStory(raw: Raw, ctx: NormalizeContext): TapdItem {
  return {
    ...base('story', raw, ctx, raw.name ?? '', raw.owner ?? '', ctx.statusLabels),
    ...(raw.workitem_type_id && { workitemTypeId: raw.workitem_type_id })
  }
}

export function normalizeBug(raw: Raw, ctx: NormalizeContext): TapdItem {
  return base('bug', raw, ctx, raw.title ?? '', raw.current_owner ?? '', ctx.statusLabels)
}

export function normalizeTask(raw: Raw, ctx: NormalizeContext): TapdItem {
  return {
    ...base('task', raw, ctx, raw.name ?? '', raw.owner ?? '', TASK_STATUS_LABELS),
    ...(raw.story_id && raw.story_id !== '0' && { storyId: raw.story_id })
  }
}
