import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ReleaseJob, ReleaseRequest, ReleaseStep, RunSession } from '../../shared/types'
import { AppError, toErrorInfo } from '../result'
import type { RunnerService } from '../runner/runnerService'
import { buildCliCommand, type CliInput } from './cliCommand'
import { detectCliError } from './cliOutput'
import { resolveProjectDir } from './projectDir'
import { qrToDataUrl } from './qrDataUrl'
import { isValidVersion, sanitizeDesc } from './releaseConfig'

export interface ReleaseContext {
  /** 构建脚本所在目录（package.json） */
  repoPath: string
  /** 小程序根目录（project.config.json） */
  root: string
  cli?: string
  token?: string
}

interface Running {
  job: ReleaseJob
  cancelled: boolean
  currentRunId?: string
}

/**
 * 事件：`changed` (ReleaseJob) —— 任何状态变化都会推送完整快照
 */
export class ReleaseService extends EventEmitter {
  private readonly jobs = new Map<string, Running>()
  private readonly exitWaiters = new Map<string, (code: number | null) => void>()
  private readonly tmpRoot: string

  constructor(
    private readonly runner: RunnerService,
    opts: { tmpRoot?: string } = {}
  ) {
    super()
    this.tmpRoot = opts.tmpRoot ?? join(tmpdir(), 'workbench-desktop', 'release')
    runner.on('exit', ({ runId, exitCode }: { runId: string; exitCode: number | null }) => {
      const resolve = this.exitWaiters.get(runId)
      if (resolve) {
        this.exitWaiters.delete(runId)
        resolve(exitCode)
      }
    })
  }

  async start(req: ReleaseRequest, ctx: ReleaseContext): Promise<ReleaseJob> {
    if (this.findRunning(req.projectId)) {
      throw new AppError('RELEASE_RUNNING', '该项目已有发版流程在进行中')
    }
    if (!ctx.cli) throw new AppError('WECHAT_CLI_NOT_CONFIGURED', '请先在设置中配置微信开发者工具 cli.bat 路径')
    if (!existsSync(ctx.cli)) {
      throw new AppError('WECHAT_CLI_NOT_FOUND', '微信开发者工具 cli.bat 路径不存在，请在设置中修改', ctx.cli)
    }
    if (req.action === 'upload') {
      if (!req.version || !isValidVersion(req.version)) {
        throw new AppError('INVALID_VERSION', `版本号需要是 x.y.z 格式：${req.version ?? ''}`)
      }
      if (!req.desc || !sanitizeDesc(req.desc)) throw new AppError('INVALID_DESC', '请填写上传描述')
    }
    await resolveProjectDir(ctx.root)

    const steps: ReleaseStep[] = []
    if (req.build.kind === 'script') steps.push({ kind: 'build', label: req.build.script, status: 'pending' })
    else if (req.build.kind === 'npm') steps.push({ kind: 'build-npm', label: '构建 npm', status: 'pending' })
    else steps.push({ kind: 'build', label: '跳过构建', status: 'skipped' })
    steps.push(
      req.action === 'preview'
        ? { kind: 'preview', label: '预览', status: 'pending' }
        : { kind: 'upload', label: `上传 ${req.version}`, status: 'pending' }
    )

    const job: ReleaseJob = {
      jobId: randomUUID(),
      projectId: req.projectId,
      action: req.action,
      status: 'running',
      steps,
      startedAt: Date.now()
    }
    for (const [id, r] of this.jobs) {
      if (r.job.projectId === req.projectId) this.jobs.delete(id)
    }
    const running: Running = { job, cancelled: false }
    this.jobs.set(job.jobId, running)
    this.emitChanged(job)
    void this.run(running, req, ctx)
    return structuredClone(job)
  }

  async cancel(jobId: string): Promise<void> {
    const running = this.jobs.get(jobId)
    if (!running) throw new AppError('RELEASE_NOT_FOUND', `发版流程不存在：${jobId}`)
    if (running.job.status !== 'running') return
    running.cancelled = true
    if (running.currentRunId) await this.runner.stop(running.currentRunId)
  }

  async cancelAll(): Promise<void> {
    await Promise.all(
      [...this.jobs.values()].filter((r) => r.job.status === 'running').map((r) => this.cancel(r.job.jobId))
    )
  }

  list(): ReleaseJob[] {
    return [...this.jobs.values()].map((r) => structuredClone(r.job))
  }

  private findRunning(projectId: string): Running | undefined {
    return [...this.jobs.values()].find((r) => r.job.projectId === projectId && r.job.status === 'running')
  }

  private async run(running: Running, req: ReleaseRequest, ctx: ReleaseContext): Promise<void> {
    const { job } = running
    const tmp = join(this.tmpRoot, job.jobId)
    const env: Record<string, string> = ctx.token ? { WECHAT_DEVTOOLS_CLI_TOKEN: ctx.token } : {}
    const cli = ctx.cli as string
    const [buildStep, actionStep] = job.steps
    try {
      if (buildStep.status === 'pending') {
        const projectDir = await resolveProjectDir(ctx.root)
        await this.runStep(running, buildStep, () =>
          buildStep.kind === 'build-npm'
            ? this.startCli(job.projectId, buildStep.label, cli, { kind: 'build-npm', projectDir: projectDir.dir }, ctx, env)
            : this.runner.start({ projectId: job.projectId, repoPath: ctx.repoPath, script: buildStep.label })
        )
      }

      const projectDir = await resolveProjectDir(ctx.root)
      job.appid = projectDir.appid
      if (req.action === 'upload' && req.expectedAppid !== undefined && req.expectedAppid !== projectDir.appid) {
        throw new AppError(
          'APPID_CHANGED',
          `构建后 appid 与确认时不一致：${req.expectedAppid ?? '无'} → ${projectDir.appid ?? '无'}，已停止上传，请核对后重新上传`
        )
      }

      await mkdir(tmp, { recursive: true })
      const infoOutput = join(tmp, 'info.json')
      if (req.action === 'preview') {
        const qrOutput = join(tmp, 'qr.txt')
        await this.runStep(running, actionStep, () =>
          this.startCli(job.projectId, actionStep.label, cli, { kind: 'preview', projectDir: projectDir.dir, qrOutput, infoOutput }, ctx, env)
        )
        if (!existsSync(qrOutput)) throw new AppError('QR_NOT_FOUND', '预览完成但没有生成二维码文件', qrOutput)
        try {
          job.qrDataUrl = qrToDataUrl(await readFile(qrOutput))
        } catch (e) {
          throw new AppError('QR_INVALID', `二维码文件无法显示：${(e as Error).message}`, qrOutput)
        }
        job.qrAt = Date.now()
      } else {
        const version = req.version as string
        const desc = sanitizeDesc(req.desc as string)
        await this.runStep(running, actionStep, () =>
          this.startCli(job.projectId, actionStep.label, cli, { kind: 'upload', projectDir: projectDir.dir, version, desc, infoOutput }, ctx, env)
        )
        job.upload = { version, desc }
      }
      job.packageSize = await readPackageSize(infoOutput)
      job.status = 'ok'
    } catch (e) {
      for (const step of job.steps) {
        if (step.status === 'pending') step.status = running.cancelled ? 'cancelled' : 'skipped'
      }
      if (running.cancelled) {
        job.status = 'cancelled'
      } else {
        job.status = 'failed'
        job.error = toErrorInfo(e)
      }
    } finally {
      job.finishedAt = Date.now()
      running.currentRunId = undefined
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
      this.emitChanged(job)
    }
  }

  private startCli(
    projectId: string,
    label: string,
    cli: string,
    input: CliInput,
    ctx: ReleaseContext,
    env: Record<string, string>
  ): Promise<RunSession> {
    return this.runner.startCommand({ projectId, label, command: buildCliCommand(cli, input), cwd: ctx.root, env })
  }

  private async runStep(running: Running, step: ReleaseStep, startFn: () => Promise<RunSession>): Promise<void> {
    if (running.cancelled) throw new AppError('RELEASE_CANCELLED', '已取消')
    step.status = 'running'
    step.startedAt = Date.now()
    this.emitChanged(running.job)

    let session: RunSession
    try {
      session = await startFn()
    } catch (e) {
      step.status = 'failed'
      step.finishedAt = Date.now()
      throw e
    }
    step.runId = session.runId
    running.currentRunId = session.runId
    this.emitChanged(running.job)
    if (running.cancelled) void this.runner.stop(session.runId)

    const code = await this.waitExit(session.runId)
    running.currentRunId = undefined
    step.finishedAt = Date.now()
    if (running.cancelled) {
      step.status = 'cancelled'
      throw new AppError('RELEASE_CANCELLED', '已取消')
    }
    const cliError = step.kind === 'build' ? null : detectCliError(this.runner.buffer(session.runId))
    if (code !== 0 || cliError) {
      step.status = 'failed'
      if (cliError) throw new AppError(cliError.code, cliError.message, cliError.detail)
      throw new AppError('STEP_FAILED', `${step.label} 失败（退出码 ${code}）`, `${step.kind} exit ${code}`)
    }
    step.status = 'ok'
    this.emitChanged(running.job)
  }

  private waitExit(runId: string): Promise<number | null> {
    const session = this.runner.list().find((s) => s.runId === runId)
    if (session?.status === 'exited') return Promise.resolve(session.exitCode ?? null)
    return new Promise((resolve) => this.exitWaiters.set(runId, resolve))
  }

  private emitChanged(job: ReleaseJob): void {
    this.emit('changed', structuredClone(job))
  }
}

async function readPackageSize(infoPath: string): Promise<number | undefined> {
  try {
    const info = JSON.parse(await readFile(infoPath, 'utf8')) as { size?: { total?: number } }
    return typeof info.size?.total === 'number' ? info.size.total : undefined
  } catch {
    return undefined
  }
}
