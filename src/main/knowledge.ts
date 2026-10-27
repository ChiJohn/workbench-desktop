import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { keepSources, parseDraft, splitAnswer } from '../core/knowledge/answer'
import { ingestDroppedFile, type InboxItem } from '../core/knowledge/inbox'
import { KNOWLEDGE_DIR, QA_DIR, findDeposit, renderKnowledge, renderQa, saveNote, todayStamp, vaultFile } from '../core/knowledge/notes'
import { askPrompt, distillPrompt } from '../core/knowledge/prompt'
import { cleanSearch, parseSearchOutput, searchArgs, type SearchGroup } from '../core/knowledge/search'
import { readFrontmatter, readSection } from '../core/markdown/sections'
import { AppError } from '../core/result'
import { ReportWriterRunner, resolveWriter } from '../core/report/writer'
import { killTree } from '../core/runner/killTree'
import type { KnowledgeAnswer, KnowledgeAskRequest, KnowledgeDraft, KnowledgeDraftRequest, KnowledgeSaveRequest } from '../shared/types'
import type { Services } from './services'
import { recognizeImage } from './paddleRecognize'

const SEARCH_TIMEOUT_MS = 20_000
const SEARCH_LIMIT = 30

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

/** 默认安装目录之外（例如 D:\Program Files）也要能找到 Obsidian.com */
function defaultObsidian(env: NodeJS.ProcessEnv): string {
  const candidates = [
    env.ProgramFiles && join(env.ProgramFiles, 'Obsidian', 'Obsidian.com'),
    env['ProgramFiles(x86)'] && join(env['ProgramFiles(x86)'], 'Obsidian', 'Obsidian.com'),
    join('D:\\Program Files', 'Obsidian', 'Obsidian.com'),
    join('C:\\Program Files', 'Obsidian', 'Obsidian.com')
  ].filter((p): p is string => Boolean(p))
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

function runObsidian(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      reject(new AppError('KNOWLEDGE_CLI_FAILED', `Obsidian 搜索失败：${(e as Error).message}`))
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      if (child.pid) void killTree(child.pid)
      finish(() => reject(new AppError('KNOWLEDGE_CLI_TIMEOUT', 'Obsidian 搜索超时')))
    }, SEARCH_TIMEOUT_MS)
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => (stdout += chunk))
    child.stderr?.on('data', (chunk: string) => (stderr += chunk))
    child.on('error', (e) => finish(() => reject(new AppError('KNOWLEDGE_CLI_FAILED', `Obsidian 搜索失败：${e.message}`))))
    child.on('close', (code) => {
      finish(() => {
        if (code !== 0 && !stdout.trim()) reject(new AppError('KNOWLEDGE_CLI_FAILED', `Obsidian 搜索失败：${stderr.trim() || `退出码 ${code}`}`))
        else resolve(stdout)
      })
    })
  })
}

export class KnowledgeController {
  private readonly runner = new ReportWriterRunner({
    spawn: (command, args, cwd) => spawn(command, args, { cwd, windowsHide: true, stdio: 'pipe' }),
    kill: killTree,
    busyMessage: '已有问答在生成'
  })
  private chain: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly services: Services,
    private readonly onProgress: (text: string) => void
  ) {}

  private get prefs() {
    return this.services.prefs.get()
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async runWriter(prompt: string): Promise<string> {
    const vault = this.prefs.vaultPath
    const report = this.prefs.report ?? {}
    const cmd = resolveWriter(
      { writer: this.prefs.knowledge?.writer ?? 'cursor', claudePath: report.claudePath, cursorAgentPath: report.cursorAgentPath, codexPath: report.codexPath, workspace: vault, profile: 'ask' },
      process.env,
      writerFs
    )
    return this.runner.run(cmd, prompt, vault, this.onProgress)
  }

  async ask(input: KnowledgeAskRequest): Promise<KnowledgeAnswer> {
    const question = input.question?.trim()
    if (!question) throw new AppError('KNOWLEDGE_EMPTY', '请输入问题')
    const text = await this.runWriter(askPrompt(question, input.project))
    const split = splitAnswer(text)
    const kept = keepSources(this.prefs.vaultPath, split.sources)
    return { answer: split.body, sources: kept.sources, dropped: kept.dropped }
  }

  cancel(): void {
    this.runner.cancel()
  }

  search(query: string, project?: string): Promise<SearchGroup[]> {
    const q = query.trim()
    if (!q) return Promise.reject(new AppError('KNOWLEDGE_EMPTY', '请输入关键词'))
    return this.enqueue(async () => {
      const command = (this.prefs.knowledge?.obsidianCli || defaultObsidian(process.env)).trim()
      if (!existsSync(command)) throw new AppError('KNOWLEDGE_CLI_MISSING', '找不到 Obsidian CLI，可在设置「知识」中指定 Obsidian.com 的路径')
      const stdout = await runObsidian(command, searchArgs(basename(this.prefs.vaultPath), q, SEARCH_LIMIT))
      return cleanSearch(parseSearchOutput(stdout), 12, project?.trim() || undefined)
    })
  }

  async draft(input: KnowledgeDraftRequest): Promise<KnowledgeDraft> {
    const vault = this.prefs.vaultPath
    if (input.task) {
      const rel = vaultFile(vault, input.task)
      if (!rel) throw new AppError('KNOWLEDGE_PATH', '任务卡不在 vault 里')
      const existing = await findDeposit(vault, rel)
      if (existing) return { existing, title: '', body: '', project: input.project?.trim() || '' }
      const md = await readFile(join(vault, ...rel.split('/')), 'utf8')
      const fm = readFrontmatter(md)
      const result = (readSection(md, '结果') ?? '').trim()
      const log = (readSection(md, '执行记录') ?? '').trim()
      const material = [result && result !== '待填写。' ? result : '', log].filter(Boolean).join('\n\n') || '（任务卡没有可沉淀的内容）'
      return this.distill(fm.title || input.title || '未命名', fm.project || input.project || '', material, rel)
    }
    return this.distill(input.title?.trim() || '未命名', input.project?.trim() || '', input.material?.trim() || '')
  }

  private async distill(title: string, project: string, material: string, task?: string): Promise<KnowledgeDraft> {
    try {
      const text = await this.runWriter(distillPrompt(title, material))
      const parsed = parseDraft(text, title)
      return { title: parsed.title, body: parsed.body, project, task }
    } catch (e) {
      if (e instanceof AppError && (e.code === 'REPORT_CANCELLED' || e.code === 'REPORT_WRITER_BUSY')) throw e
      return { title, body: material, project, task }
    }
  }

  async ingest(paths: string[]): Promise<InboxItem[]> {
    const list = paths.map((item) => item.trim()).filter(Boolean)
    if (!list.length) throw new AppError('INBOX_EMPTY', '没有文件')
    const vault = this.prefs.vaultPath
    const items: InboxItem[] = []
    for (const source of list) {
      try {
        items.push(await ingestDroppedFile(vault, source, recognizeImage))
      } catch (error) {
        const message = error instanceof AppError ? error.message : error instanceof Error ? error.message : String(error)
        items.push({ name: basename(source), category: '', title: '', notePath: '', filePath: '', error: message })
      }
    }
    return items
  }

  async save(input: KnowledgeSaveRequest): Promise<string> {
    const vault = this.prefs.vaultPath
    const title = input.title?.trim()
    const body = input.body?.trim()
    if (!title || !body) throw new AppError('KNOWLEDGE_EMPTY', '标题和正文都不能为空')
    const sources = keepSources(vault, input.sources ?? []).sources
    const created = todayStamp()
    const project = input.project?.trim() || ''
    if (input.kind === 'qa') {
      return saveNote(vault, QA_DIR, renderQa({ question: input.question?.trim() || title, project, answer: body, sources, created }), created, title)
    }
    const task = input.task ? vaultFile(vault, input.task) : null
    if (input.task && !task) throw new AppError('KNOWLEDGE_PATH', '任务卡不在 vault 里')
    return saveNote(vault, KNOWLEDGE_DIR, renderKnowledge({ title, project, task: task ?? undefined, sources, body, created }), created, title)
  }
}
