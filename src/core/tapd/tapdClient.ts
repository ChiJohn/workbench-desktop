import { AppError } from '../result'
import type { Raw } from './normalize'

export type Params = Record<string, string | number | undefined>

export interface TapdClientOptions {
  token: () => string | undefined
  fetch?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
}

interface Envelope {
  status?: number
  data?: unknown
  info?: string
}

const MAX_PAGES = 20

export class TapdClient {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(private readonly opts: TapdClientOptions) {
    this.fetchImpl = opts.fetch ?? fetch
    this.baseUrl = opts.baseUrl ?? 'https://api.tapd.cn'
    this.timeoutMs = opts.timeoutMs ?? 15_000
  }

  get<T>(path: string, params: Params = {}): Promise<T> {
    const url = new URL(this.baseUrl + path)
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v))
    return this.request<T>(url, { method: 'GET' })
  }

  post<T>(path: string, body: Params): Promise<T> {
    const form = new URLSearchParams()
    for (const [k, v] of Object.entries(body)) if (v !== undefined) form.set(k, String(v))
    return this.request<T>(new URL(this.baseUrl + path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    })
  }

  /** 列表接口返回 `[{ Story: {...} }]`，翻页直到不足一页 */
  async listAll(path: string, params: Params, entity: string, pageSize = 200): Promise<Raw[]> {
    const rows: Raw[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await this.get<Record<string, Raw>[]>(path, { ...params, limit: pageSize, page })
      const list = Array.isArray(data) ? data : []
      rows.push(...list.map((r) => r[entity]).filter(Boolean))
      if (list.length < pageSize) break
    }
    return rows
  }

  private async request<T>(url: URL, init: RequestInit): Promise<T> {
    const token = this.opts.token()
    if (!token) throw new AppError('TAPD_TOKEN_MISSING', '请先在「设置」中配置 TAPD 令牌')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let res: Response
    try {
      res = await this.fetchImpl(url.href, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
        signal: controller.signal
      })
    } catch (e) {
      const timedOut = controller.signal.aborted
      throw new AppError('TAPD_NETWORK', timedOut ? '请求 TAPD 超时' : '无法连接 TAPD', `${url.pathname}\n${String(e)}`)
    } finally {
      clearTimeout(timer)
    }

    const body = (await res.json().catch(() => ({}))) as Envelope
    if (res.status === 401 || /access token/i.test(body.info ?? '')) {
      throw new AppError('TAPD_UNAUTHORIZED', 'TAPD 令牌无效或已过期，请在「设置」中更新', body.info)
    }
    if (body.status !== 1) {
      throw new AppError('TAPD_ERROR', `TAPD：${body.info || `HTTP ${res.status}`}`, `${url.pathname}\n${JSON.stringify(body).slice(0, 500)}`)
    }
    return body.data as T
  }
}
