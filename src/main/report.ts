import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execCommand } from '../core/exec'
import { collectCards } from '../core/report/cards'
import { buildPrompt, renderMaterial } from '../core/report/material'
import { readReport, saveReport } from '../core/report/reportFile'
import { collectGit, multicaEntries, tapdEntries } from '../core/report/sources'
import { ensureTemplate } from '../core/report/templates'
import { ReportWriterRunner, resolveWriter } from '../core/report/writer'
import { AppError, toErrorInfo } from '../core/result'
import { killTree } from '../core/runner/killTree'
import type { ReportEntry, ReportGenerateRequest, ReportKind, ReportMaterial, ReportRange, ReportSource, ReportSourceResult } from '../shared/types'
import type { Services } from './services'

export class ReportController {
  private readonly runner = new ReportWriterRunner({
    spawn: (command, args, cwd) => spawn(command, args, { cwd, windowsHide: true, stdio: 'pipe' }),
    kill: killTree
  })
  private gitUser: string | null = null
  private nick: string | null = null

  constructor(
    private readonly services: Services,
    private readonly onProgress: (text: string) => void
  ) {}

  private get prefs() {
    return this.services.prefs.get()
  }

  private async authors(): Promise<string[]> {
    const configured = (this.prefs.report?.authors ?? []).map((a) => a.trim()).filter(Boolean)
    if (configured.length) return configured
    if (this.gitUser === null) {
      const r = await execCommand('git', ['config', '--global', 'user.name'], { timeoutMs: 10_000 }).catch(() => null)
      this.gitUser = r?.code === 0 ? r.stdout.trim() : ''
    }
    return this.gitUser ? [this.gitUser] : []
  }

  /** 月报文件名中的姓名：设置 → TAPD 昵称 → 省略 */
  async displayName(): Promise<string | undefined> {
    const configured = this.prefs.report?.displayName?.trim()
    if (configured) return configured
    if (this.nick === null && this.services.tapdToken.get()) this.nick = await this.services.tapd.nick().catch(() => null)
    return this.nick || undefined
  }

  async existing(kind: ReportKind, range: ReportRange) {
    return readReport(this.prefs.vaultPath, kind, range, kind === 'monthly' ? await this.displayName() : undefined)
  }

  async collect(kind: ReportKind, range: ReportRange): Promise<ReportMaterial> {
    const { registry, git, tapd, tapdToken, multica } = this.services
    const source = async (name: ReportSource, fn: () => Promise<ReportEntry[] | ReportSourceResult>): Promise<ReportSourceResult> => {
      try {
        const r = await fn()
        return Array.isArray(r) ? { source: name, entries: r } : r
      } catch (e) {
        return { source: name, entries: [], error: toErrorInfo(e).message }
      }
    }
    const sources = await Promise.all([
      source('git', async () => {
        const authors = await this.authors()
        if (!authors.length) throw new AppError('REPORT_NO_AUTHOR', '没有 git 作者，请在设置「汇报」中填写')
        const { projects } = await registry.current()
        const repos = projects.filter((p) => p.available).map((p) => ({ name: p.name, path: p.repoPath }))
        return collectGit(git, repos, range, authors)
      }),
      source('tapd', async () => {
        if (!tapdToken.get()) throw new AppError('TAPD_NO_TOKEN', '未配置 TAPD 令牌')
        const { items, errors } = await tapd.history(range)
        const result: ReportSourceResult = { source: 'tapd', entries: tapdEntries(items) }
        if (errors.length) result.error = errors.map((e) => `${e.workspaceName}：${e.message}`).join('；')
        return result
      }),
      source('multica', async () => {
        await registry.current().catch(() => null)
        return multicaEntries(await multica.doneBetween(range))
      }),
      source('cards', () => collectCards(this.prefs.vaultPath, range))
    ])
    return { kind, range, sources, existing: await this.existing(kind, range), collectedAt: Date.now() }
  }

  async generate(req: ReportGenerateRequest): Promise<string> {
    if (this.runner.running) throw new AppError('REPORT_WRITER_BUSY', '已有报告在生成')
    const report = this.prefs.report ?? {}
    const template = await ensureTemplate(this.prefs.vaultPath, req.kind)
    const prompt = buildPrompt(req.kind, req.range, template, renderMaterial(req.entries, req.notes))
    const dir = await mkdtemp(join(tmpdir(), 'wb-report-'))
    try {
      const cmd = resolveWriter({ ...report, workspace: dir }, process.env, {
        exists: existsSync,
        list: (d) => {
          try {
            return readdirSync(d)
          } catch {
            return []
          }
        }
      })
      return await this.runner.run(cmd, prompt, dir, this.onProgress)
    } finally {
      // CLI 的子进程退出前目录仍被占用
      void rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }).catch(() => undefined)
    }
  }

  cancel(): void {
    this.runner.cancel()
  }

  async save(kind: ReportKind, range: ReportRange, content: string): Promise<string> {
    if (!content.trim()) throw new AppError('REPORT_EMPTY', '报告内容为空')
    return saveReport(this.prefs.vaultPath, kind, range, content, kind === 'monthly' ? await this.displayName() : undefined)
  }

  /** 设置变更后重新读取作者和姓名 */
  reset(): void {
    this.gitUser = null
    this.nick = null
  }
}
