import { readFile, rename, writeFile } from 'node:fs/promises'
import { todayStamp } from '../knowledge/notes'
import { normalizeRepoPath } from '../paths'
import { AppError } from '../result'
import type { Project, ProjectWriteRequest, RegistryResult } from '../../shared/types'
import { ensureHomepage, renderHomepage } from './homepage'
import { addRow, removeRow, updateRow, writtenType } from './repoMapEdit'

export interface ProjectAdminDeps {
  mapPath(): string
  vaultPath(): string
  reload(): Promise<RegistryResult>
}

/** 串行改 项目.md，写临时文件再替换，并按需建项目主页 */
export class ProjectAdmin {
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly deps: ProjectAdminDeps) {}

  add(req: ProjectWriteRequest): Promise<Project> {
    return this.enqueue(() => this.write(req, (md, today) => addRow(md, req, today)))
  }

  update(id: string, req: ProjectWriteRequest): Promise<Project> {
    return this.enqueue(() => this.write(req, (md, today) => updateRow(md, id, req, today), normalizeRepoPath(req.repoPath)))
  }

  remove(id: string): Promise<null> {
    return this.enqueue(async () => {
      const today = todayStamp()
      const markdown = await this.readMap()
      await this.save(removeRow(markdown, id, today))
      await this.deps.reload()
      return null
    })
  }

  private async write(req: ProjectWriteRequest, edit: (markdown: string, today: string) => string, id = normalizeRepoPath(req.repoPath)): Promise<Project> {
    const today = todayStamp()
    const markdown = await this.readMap()
    await this.save(edit(markdown, today))
    if (req.createHomepage) {
      const name = req.name.trim()
      await ensureHomepage(
        this.deps.vaultPath(),
        name,
        renderHomepage({ name, repoPath: req.repoPath.trim(), typeText: writtenType(req.type, req.typeLabel), note: req.note }, today)
      )
    }
    const { projects } = await this.deps.reload()
    const project = projects.find((p) => p.id === id)
    if (!project) throw new AppError('PROJECT_NOT_FOUND', '已写入但没有解析到项目')
    return project
  }

  private async readMap(): Promise<string> {
    try {
      return await readFile(this.deps.mapPath(), 'utf8')
    } catch {
      throw new AppError('MAP_NOT_FOUND', '找不到项目.md，请在设置中检查 vault 路径')
    }
  }

  private async save(content: string): Promise<void> {
    const file = this.deps.mapPath()
    const tmp = `${file}.tmp`
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, file)
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn)
    this.tail = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}
