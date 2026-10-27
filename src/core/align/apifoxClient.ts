import { AppError } from '../result'
import { type FoundOperation, requireOperation } from './contract'
import type { ApifoxLink } from './links'

const TTL_MS = 5 * 60_000
const EXPORT_BODY = {
  scope: { type: 'ALL' },
  options: { includeApifoxExtensionProperties: true, addFoldersToTags: true },
  oasVersion: '3.0',
  exportFormat: 'JSON'
}

interface Cached {
  at: number
  doc: Parameters<typeof requireOperation>[0]
}

export class ApifoxClient {
  private cache = new Map<string, Cached>()

  constructor(
    private readonly deps: {
      token(): string | undefined
      fetch(url: string, init: RequestInit): Promise<Response>
      now(): number
    }
  ) {}

  async operation(link: ApifoxLink): Promise<{ doc: Cached['doc']; found: FoundOperation }> {
    const doc = await this.exportProject(link.projectId)
    return { doc, found: requireOperation(doc, link.apiId) }
  }

  private async exportProject(projectId: string): Promise<Cached['doc']> {
    const token = this.deps.token()
    if (!token) throw new AppError('APIFOX_TOKEN', '先在「设置 → Apifox」填写访问令牌')
    const hit = this.cache.get(projectId)
    if (hit && this.deps.now() - hit.at < TTL_MS) return hit.doc
    let response: Response
    try {
      response = await this.deps.fetch(`https://api.apifox.com/v1/projects/${projectId}/export-openapi?locale=zh-CN`, {
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
      throw new AppError('APIFOX_FAILED', '拉取 Apifox 失败，可以重试', e instanceof Error ? e.message : String(e))
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError('APIFOX_TOKEN', 'Apifox 令牌无效，请重新生成')
    }
    if (!response.ok) throw new AppError('APIFOX_FAILED', `拉取 Apifox 失败（HTTP ${response.status}），可以重试`)
    const doc = (await response.json()) as Cached['doc']
    this.cache.set(projectId, { at: this.deps.now(), doc })
    return doc
  }
}
