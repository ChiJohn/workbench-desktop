import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { projectLabel } from '../core/tasks/taskCard'
import { ApifoxClient } from '../core/align/apifoxClient'
import { attachApi, attachFigma, detach, listAlign, renameFigma } from '../core/align/attach'
import { findLinks, classifyLink } from '../core/align/links'
import { renderAlignForDispatch, type DispatchContract, type DispatchDesign } from '../core/align/dispatchContext'
import { AppError } from '../core/result'
import type { AlignState, Project, TapdItem } from '../shared/types'

export class AlignController {
  private readonly client: ApifoxClient

  constructor(
    private readonly deps: {
      vault(): string
      token(): string | undefined
      detail(key: string): Promise<{ item: TapdItem; description: string }>
      project(item: TapdItem): Promise<Project | null>
      card(tapdId: string): Promise<string | null>
      createCard(item: TapdItem, description: string, project: Project): Promise<string>
    }
  ) {
    this.client = new ApifoxClient({
      token: () => this.deps.token(),
      fetch: (url, init) => fetch(url, init),
      now: () => Date.now()
    })
  }

  async state(key: string): Promise<AlignState> {
    const { item, description } = await this.deps.detail(key)
    const card = await this.deps.card(item.id)
    const current = await listAlign(this.deps.vault(), card)
    const known = new Set([...current.designs.map((d) => d.url), ...current.apis.map((a) => a.url).filter(Boolean)])
    const detected = findLinks(description)
      .filter((link) => !known.has(link.url))
      .map((link) => ({ kind: link.kind, url: link.url, name: link.kind === 'figma' ? link.name : `api-${link.apiId}` }))
    return { ...current, detected }
  }

  async add(key: string, rawUrl: string): Promise<AlignState> {
    const link = classifyLink(rawUrl)
    const card = await this.ensureCard(key)
    const vault = this.deps.vault()
    if (link.kind === 'figma') {
      await attachFigma(vault, card, link)
    } else {
      const project = await this.projectOf(key)
      await attachApi(vault, card, projectLabel(project.obsidianLink), link, (item) => this.client.operation(item), new Date(), false)
    }
    return this.state(key)
  }

  async refresh(key: string, rawUrl: string): Promise<AlignState> {
    const link = classifyLink(rawUrl)
    if (link.kind !== 'apifox') throw new AppError('ALIGN_LINK', '只有接口可以重新拉取')
    const card = await this.ensureCard(key)
    const project = await this.projectOf(key)
    await attachApi(this.deps.vault(), card, projectLabel(project.obsidianLink), link, (item) => this.client.operation(item), new Date(), true)
    return this.state(key)
  }

  async remove(key: string, urlOrTarget: string): Promise<AlignState> {
    const { item } = await this.deps.detail(key)
    const card = await this.deps.card(item.id)
    if (!card) throw new AppError('CARD_NOT_FOUND', '还没有任务卡')
    await detach(this.deps.vault(), card, urlOrTarget)
    return this.state(key)
  }

  async rename(key: string, url: string, name: string): Promise<AlignState> {
    const { item } = await this.deps.detail(key)
    const card = await this.deps.card(item.id)
    if (!card) throw new AppError('CARD_NOT_FOUND', '还没有任务卡')
    await renameFigma(this.deps.vault(), card, url, name)
    return this.state(key)
  }

  async forDispatch(key: string, skip?: { skipDesigns?: string[]; skipApis?: string[] }): Promise<{ designs: DispatchDesign[]; contracts: DispatchContract[] }> {
    const { item } = await this.deps.detail(key)
    const card = await this.deps.card(item.id)
    const current = await listAlign(this.deps.vault(), card)
    const designs = current.designs.filter((d) => !skip?.skipDesigns?.includes(d.url))
    const chosen = current.apis.filter((a) => !skip?.skipApis?.includes(a.target))
    const contracts: DispatchContract[] = []
    for (const api of chosen) {
      try {
        const body = await readFile(this.file(api.path), 'utf8')
        contracts.push({ title: api.title, path: api.path, body: body.replace(/^---[\s\S]*?---\r?\n/, '') })
      } catch {
        // 契约文件丢了就跳过，不挡住派单
      }
    }
    return { designs, contracts }
  }

  private file(rel: string): string {
    const full = resolve(this.deps.vault(), rel)
    const root = resolve(this.deps.vault())
    if (full !== root && !full.startsWith(root + sep)) throw new AppError('ALIGN_LINK', '路径超出 vault')
    return full
  }

  private async projectOf(key: string): Promise<Project> {
    const { item } = await this.deps.detail(key)
    const project = await this.deps.project(item)
    if (!project) throw new AppError('ALIGN_NO_REPO', '先关联仓库，任务卡和接口契约要写到对应项目下')
    return project
  }

  private async ensureCard(key: string): Promise<string> {
    const { item, description } = await this.deps.detail(key)
    const existing = await this.deps.card(item.id)
    if (existing) return existing
    const project = await this.projectOf(key)
    return this.deps.createCard(item, description, project)
  }
}

export function appendAlign(body: string, designs: DispatchDesign[], contracts: DispatchContract[]): string {
  const extra = renderAlignForDispatch(designs, contracts)
  return extra ? `${body.trim()}\n\n${extra}\n` : body
}
