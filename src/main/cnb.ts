import { mapLimit } from '../core/concurrency'
import { listCnbBuilds, startCnbBuild } from '../core/cnb/client'
import { apiTriggerEvents, webTriggerButtons } from '../core/cnb/config'
import { parseCnbRemote } from '../core/cnb/slug'
import { AppError } from '../core/result'
import type { CnbBuildStart, CnbProjectBuilds, CnbSummaryItem, CnbTriggers, Project } from '../shared/types'
import type { Services } from './services'

const SUMMARY_LIMIT = 4
const LIST_SIZE = 8

export class CnbController {
  constructor(private readonly services: Services) {}

  private token(): string {
    const token = this.services.cnbToken.get()
    if (!token) throw new AppError('CNB_TOKEN', '先在「设置 → CNB」填写访问令牌')
    return token
  }

  private async repoOf(project: Project) {
    if (!project.available) return null
    const remote = await this.services.git.origin(project.repoPath)
    return remote ? parseCnbRemote(remote) : null
  }

  async list(projectId: string): Promise<CnbProjectBuilds> {
    const project = await this.services.registry.require(projectId)
    const repo = await this.repoOf(project)
    if (!repo) return { slug: null, web: null, builds: [] }
    const builds = await listCnbBuilds({ ...repo, token: this.token(), pageSize: LIST_SIZE })
    return { slug: repo.slug, web: repo.web, builds }
  }

  async triggers(projectId: string, branch: string): Promise<CnbTriggers> {
    const project = await this.services.registry.require(projectId)
    const repo = await this.repoOf(project)
    if (!repo) return { options: [], patterns: [], missing: 'not-cnb' }
    const name = branch.trim()
    const buttons = await this.services.git.showFile(project.repoPath, `origin/${name}`, '.cnb/web_trigger.yml')
    if ('missing' in buttons && buttons.missing === 'rev') return { options: [], patterns: [], missing: 'rev' }
    if ('text' in buttons) {
      const parsed = webTriggerButtons(buttons.text, name)
      return { options: parsed.options, patterns: parsed.patterns, missing: null }
    }
    const config = await this.services.git.showFile(project.repoPath, `origin/${name}`, '.cnb.yml')
    if ('text' in config) {
      return {
        options: apiTriggerEvents(config.text, name).map((event) => ({ name: event, event, description: '', env: {}, matched: true })),
        patterns: [],
        missing: null
      }
    }
    return { options: [], patterns: [], missing: config.missing === 'rev' ? 'rev' : 'file' }
  }

  async start(projectId: string, branch: string, name: string): Promise<CnbBuildStart> {
    const project = await this.services.registry.require(projectId)
    const repo = await this.repoOf(project)
    if (!repo) throw new AppError('CNB_NOT_REPO', '这个仓库的远程地址不是 CNB')
    const chosen = (await this.triggers(projectId, branch)).options.find((item) => item.matched && item.name === name)
    if (!chosen) throw new AppError('CNB_BUILD_DISABLED', '当前分支不能用这个构建按钮')
    return startCnbBuild({ ...repo, token: this.token(), branch, event: chosen.event, env: chosen.env })
  }

  async summary(): Promise<CnbSummaryItem[]> {
    const token = this.token()
    const { projects } = await this.services.registry.current()
    const located = await mapLimit(projects, SUMMARY_LIMIT, async (project) => ({ project, repo: await this.repoOf(project) }))
    const matched = located.filter((item) => item.repo !== null) as {
      project: Project
      repo: NonNullable<(typeof located)[number]['repo']>
    }[]
    return mapLimit(matched, SUMMARY_LIMIT, async ({ project, repo }) => {
      try {
        const builds = await listCnbBuilds({ ...repo, token, pageSize: 1 })
        return { projectId: project.id, slug: repo.slug, latest: builds[0] ?? null }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { projectId: project.id, slug: repo.slug, latest: null, error: message }
      }
    })
  }
}
