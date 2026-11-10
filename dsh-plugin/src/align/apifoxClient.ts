import { AppError } from '../util/result.js'
import { type FoundOperation, type OpenApiDoc, requireOperation } from './contract.js'
import type { ApifoxLink } from './links.js'

const TTL_MS = 5 * 60_000
const EXPORT_BODY = {
  scope: { type: 'ALL' },
  options: { includeApifoxExtensionProperties: true, addFoldersToTags: true },
  oasVersion: '3.0',
  exportFormat: 'JSON'
}

interface Cached {
  at: number
  doc: OpenApiDoc
}

export class ApifoxClient {
  private cache = new Map<string, Cached>()

  constructor(
    private readonly deps: {
      token(): string | undefined
      fetch?: (url: string, init: RequestInit) => Promise<Response>
      now?: () => number
    }
  ) {}

  async operation(link: ApifoxLink): Promise<{ doc: OpenApiDoc; found: FoundOperation }> {
    const doc = await this.exportProject(link.projectId)
    return { doc, found: requireOperation(doc, link.apiId) }
  }

  private async exportProject(projectId: string): Promise<OpenApiDoc> {
    const token = this.deps.token()
    if (!token) throw new AppError('APIFOX_TOKEN', '未配置 Apifox 访问令牌，请在配置、环境变量 (APIFOX_ACCESS_TOKEN) 或 ~/.cursor/mcp.json 中配置')
    const now = this.deps.now ? this.deps.now() : Date.now()
    const hit = this.cache.get(projectId)
    if (hit && now - hit.at < TTL_MS) return hit.doc

    const fetchFn = this.deps.fetch || globalThis.fetch
    let response: Response
    try {
      response = await fetchFn(`https://api.apifox.com/v1/projects/${projectId}/export-openapi?locale=zh-CN`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Apifox-Api-Version': '2024-03-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(EXPORT_BODY),
        signal: AbortSignal.timeout(20_000)
      })
    } catch (e) {
      throw new AppError('APIFOX_FAILED', '拉取 Apifox 项目 OpenAPI 失败', e instanceof Error ? e.message : String(e))
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError('APIFOX_TOKEN', 'Apifox 令牌无效或无权限访问该项目，请核对令牌')
    }
    if (!response.ok) {
      throw new AppError('APIFOX_FAILED', `拉取 Apifox 失败（HTTP ${response.status}）`)
    }
    const doc = (await response.json()) as OpenApiDoc
    this.cache.set(projectId, { at: now, doc })
    return doc
  }
}
