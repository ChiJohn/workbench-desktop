import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { AssistantLoop } from '../core/assistant/loop'
import { clientActionFor, formatContext, summarize, type ReadTool, type WriteTool } from '../core/assistant/protocol'
import { ReportWriterRunner, resolveWriter } from '../core/report/writer'
import { readScripts } from '../core/runner/packageScripts'
import { killTree } from '../core/runner/killTree'
import { AppError } from '../core/result'
import { PROJECT_TYPE_LABELS, type AssistantContext, type AssistantTurn, type OpenerKind, type Project } from '../shared/types'
import type { KnowledgeController } from './knowledge'
import type { Services } from './services'

const writerFs = {
  exists: existsSync,
  list: (dir: string) => {
    try {
      return readdirSync(dir)
    } catch {
      return []
    }
  }
}

function matchProject(projects: Project[], query: string): Project | { error: string } {
  const q = query.trim().toLowerCase()
  const exact = projects.filter((project) => project.id === query.trim() || project.name.toLowerCase() === q)
  const pool = exact.length ? exact : projects.filter((project) => project.name.toLowerCase().includes(q))
  if (pool.length === 1) return pool[0]
  if (!pool.length) return { error: `没有找到项目「${query}」` }
  return { error: `项目「${query}」对应多个：${pool.map((project) => project.name).join('、')}` }
}

const asText = (error: unknown) => (error instanceof Error ? error.message : String(error))

export class AssistantController {
  private readonly runner = new ReportWriterRunner({
    spawn: (command, args, cwd) => spawn(command, args, { cwd, windowsHide: true, stdio: 'pipe' }),
    kill: killTree,
    busyMessage: '已有对话在进行'
  })
  private readonly loop: AssistantLoop

  constructor(
    private readonly services: Services,
    private readonly knowledge: KnowledgeController,
    private readonly onProgress: (text: string) => void
  ) {
    this.loop = new AssistantLoop({
      read: (name, args, context) => this.read(name, args, context),
      previewWrite: (name, args) => this.preview(name, args),
      executeWrite: (name, args) => this.execute(name, args)
    })
  }

  send(text: string, context: AssistantContext): Promise<AssistantTurn> {
    const prefs = this.services.prefs.get()
    const report = prefs.report ?? {}
    return this.loop.send(text, context, {
      mode: prefs.assistant?.mode ?? 'ask',
      run: (prompt) => {
        const cmd = resolveWriter(
          {
            writer: prefs.assistant?.writer ?? 'cursor',
            claudePath: report.claudePath,
            cursorAgentPath: report.cursorAgentPath,
            codexPath: report.codexPath,
            workspace: prefs.vaultPath
          },
          process.env,
          writerFs
        )
        return this.runner.run(cmd, prompt, prefs.vaultPath, this.onProgress)
      }
    })
  }

  confirm(): Promise<AssistantTurn> {
    return this.loop.confirm()
  }

  cancel(): AssistantTurn {
    this.runner.cancel()
    return this.loop.cancel()
  }

  private async projects(): Promise<Project[]> {
    return (await this.services.registry.current()).projects
  }

  private async project(query: string): Promise<Project> {
    const found = matchProject(await this.projects(), query)
    if ('error' in found) throw new AppError('ASSISTANT_PROJECT', found.error)
    return found
  }

  private async read(name: ReadTool, args: Record<string, string>, context: AssistantContext): Promise<string> {
    try {
      if (name === 'projects') {
        const projects = await this.projects()
        if (!projects.length) return '还没有登记项目。'
        return projects.map((project) => `${project.name}｜${PROJECT_TYPE_LABELS[project.type]}｜${project.available ? '可用' : `不可用：${project.unavailableReason ?? ''}`}`).join('\n')
      }
      if (name === 'repoStatus') {
        const project = await this.project(args.project)
        if (!project.available) return `${project.name} 不可用：${project.unavailableReason ?? ''}`
        const status = await this.services.git.status(project.repoPath)
        const commit = status.lastCommit ? `${status.lastCommit.subject}` : '暂无提交'
        return `${project.name}｜分支 ${status.branch ?? '(detached)'}｜改动 ${status.changes}｜领先 ${status.ahead} / 落后 ${status.behind}｜${commit}`
      }
      if (name === 'tapdSummary') {
        const board = await this.services.tapd.board(false)
        const counts = new Map<string, number>()
        for (const item of board.items) counts.set(item.statusLabel, (counts.get(item.statusLabel) ?? 0) + 1)
        const detail = [...counts.entries()].map(([label, count]) => `${label} ${count}`).join('，')
        return `${board.user} 的未完成单 ${board.items.length} 条${detail ? `：${detail}` : ''}`
      }
      if (name === 'multicaSummary') {
        const overview = await this.services.multica.overview(false)
        const count = (status: string) => overview.issues.filter((issue) => issue.status === status).length
        const review = overview.issues.filter((issue) => issue.status === 'in_review').slice(0, 12).map((issue) => `${issue.identifier} ${issue.title}`)
        return [`工作区 ${overview.workspace.name}：待办 ${count('todo') + count('backlog')}，进行中 ${count('in_progress')}，审核中 ${count('in_review')}，阻塞 ${count('blocked')}`, review.length ? `待审查：\n${review.join('\n')}` : '没有待审查的任务。'].join('\n')
      }
      if (name === 'knowledgeSearch') {
        const groups = await this.knowledge.search(args.query, args.project)
        if (!groups.length) return '没有找到相关笔记。'
        return groups.map((group) => `${group.file}\n${group.snippets.join('\n')}`).join('\n\n')
      }
      return formatContext(context)
    } catch (error) {
      return asText(error)
    }
  }

  private async preview(name: WriteTool, args: Record<string, string>): Promise<{ summary: string } | { error: string }> {
    const action = clientActionFor(name, args)
    if (action) return { summary: summarize(name, args) }
    try {
      const project = await this.project(args.project)
      if (!project.available) return { error: `${project.name} 不可用：${project.unavailableReason ?? ''}` }
      if (name === 'runScript') {
        const scripts = await readScripts(project.repoPath)
        if (!scripts.scripts[args.script]) return { error: `「${project.name}」没有脚本 ${args.script}` }
      }
      return { summary: summarize(name, { ...args, project: project.name }) }
    } catch (error) {
      return { error: asText(error) }
    }
  }

  private async execute(name: WriteTool, args: Record<string, string>): Promise<{ text: string; clientAction?: NonNullable<ReturnType<typeof clientActionFor>> }> {
    const action = clientActionFor(name, args)
    if (action) return { text: `已让界面${summarize(name, args)}，等用户自己提交。`, clientAction: action }
    const project = await this.project(args.project)
    if (!project.available) throw new AppError('ASSISTANT_PROJECT', `${project.name} 不可用：${project.unavailableReason ?? ''}`)
    if (name === 'openProject') {
      const opener = args.opener as OpenerKind
      const { terminal } = this.services.prefs.get()
      await this.services.launcher.open(opener, { repoPath: project.repoPath, terminal })
      return { text: `已用${args.opener}打开 ${project.name}` }
    }
    if (name === 'gitFetch') {
      await this.services.git.fetch(project.repoPath)
      return { text: `已对 ${project.name} 执行 git fetch` }
    }
    if (name === 'gitPull') {
      await this.services.git.pull(project.repoPath)
      return { text: `已对 ${project.name} 执行 git pull` }
    }
    const session = await this.services.runner.start({ projectId: project.id, repoPath: project.repoPath, script: args.script })
    return { text: `已在 ${project.name} 启动脚本 ${args.script}（${session.runId}），输出在底部日志` }
  }
}
