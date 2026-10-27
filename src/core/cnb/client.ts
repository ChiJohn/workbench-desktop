import { AppError } from '../result'
import type { CnbBuild, CnbBuildStart } from '../../shared/types'

interface RawLog {
  sn?: string
  status?: string
  title?: string
  commitTitle?: string
  targetRef?: string
  sourceRef?: string
  event?: string
  sha?: string
  nickName?: string
  userName?: string
  createTime?: string
  duration?: number
  buildLogUrl?: string
}

export async function listCnbBuilds(input: {
  api: string
  web: string
  slug: string
  token: string
  pageSize: number
  fetchImpl?: typeof fetch
}): Promise<CnbBuild[]> {
  const url = `${input.api}/${input.slug}/-/build/logs?page=1&page_size=${input.pageSize}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let response: Response
  try {
    response = await (input.fetchImpl ?? fetch)(url, {
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: 'application/vnd.cnb.api+json, application/json'
      },
      signal: controller.signal
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AppError('CNB_FAILED', `读取 CNB 构建失败：${message}`)
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 401) throw new AppError('CNB_TOKEN', 'CNB 令牌无效，请在设置里重新填写')
  if (response.status === 403) throw new AppError('CNB_FORBIDDEN', '令牌没有构建历史的读取权限')
  if (!response.ok) throw new AppError('CNB_FAILED', `CNB 返回 ${response.status}`)
  const body = (await response.json()) as { data?: RawLog[] }
  return (body.data ?? []).map((item) => toBuild(item, input.web, input.slug))
}

export async function startCnbBuild(input: {
  api: string
  web: string
  slug: string
  token: string
  branch: string
  fetchImpl?: typeof fetch
}): Promise<CnbBuildStart> {
  const branch = assertBranch(input.branch)
  const url = `${input.api}/${input.slug}/-/build/start`
  const response = await cnbFetch(url, input.token, input.fetchImpl, {
    method: 'POST',
    body: JSON.stringify({ branch, event: 'api_trigger', sync: 'false' })
  }, '令牌没有触发构建的权限（repo-cnb-trigger:rw）')
  const body = (await response.json()) as { sn?: string; buildLogUrl?: string; message?: string; success?: boolean; data?: { sn?: string; buildLogUrl?: string; message?: string; success?: boolean } }
  const result = body.data && body.success === undefined && body.sn === undefined ? body.data : body
  if (result.success === false) throw new AppError('CNB_FAILED', result.message || 'CNB 没有接受这次构建')
  const sn = result.sn ?? ''
  return {
    sn,
    message: result.message ?? '',
    url: result.buildLogUrl || (sn ? `${input.web}/${input.slug}/-/build/logs/${sn}` : `${input.web}/${input.slug}`)
  }
}

function assertBranch(branch: string): string {
  const name = branch.trim()
  if (!name || name.startsWith('-') || /[\s\u0000]/.test(name) || name.includes('..')) {
    throw new AppError('INVALID_BRANCH', `不能用这个分支触发构建：「${branch}」`)
  }
  return name
}

async function cnbFetch(url: string, token: string, fetchImpl: typeof fetch | undefined, init: RequestInit, forbidden: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  let response: Response
  try {
    response = await (fetchImpl ?? fetch)(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.cnb.api+json, application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {})
      },
      signal: controller.signal
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AppError('CNB_FAILED', `请求 CNB 失败：${message}`)
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 401) throw new AppError('CNB_TOKEN', 'CNB 令牌无效，请在设置里重新填写')
  if (response.status === 403) throw new AppError('CNB_FORBIDDEN', forbidden)
  if (!response.ok) throw new AppError('CNB_FAILED', `CNB 返回 ${response.status}`)
  return response
}

function toBuild(item: RawLog, web: string, slug: string): CnbBuild {
  const sn = item.sn ?? ''
  return {
    sn,
    status: item.status ?? '',
    title: item.title || item.commitTitle || sn,
    ref: item.targetRef || item.sourceRef || '',
    event: item.event ?? '',
    sha: (item.sha ?? '').slice(0, 8),
    user: item.nickName || item.userName || '',
    createTime: item.createTime ?? '',
    durationMs: typeof item.duration === 'number' ? item.duration : null,
    url: item.buildLogUrl || (sn ? `${web}/${slug}/-/build/logs/${sn}` : `${web}/${slug}`)
  }
}
