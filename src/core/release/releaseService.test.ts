import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReleaseJob, ReleaseRequest } from '../../shared/types'
import { RunnerService } from '../runner/runnerService'
import { ReleaseService, type ReleaseContext } from './releaseService'

/**
 * 假 cli：记录参数；preview 写二维码、upload/preview 写 info；
 * FAKE_CLI_FAIL=<命令> 时退出码 1；FAKE_CLI_SLOW=1 时一直运行
 */
const FAKE_CLI_JS = `
const fs = require('fs')
const args = process.argv.slice(2)
const kind = args[0]
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
fs.appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify({ args, token: process.env.WECHAT_DEVTOOLS_CLI_TOKEN || null }) + '\\n')
console.log('[fake-cli] ' + kind)
if (process.env.FAKE_CLI_SLOW === '1') setInterval(() => {}, 1000)
else if (process.env.FAKE_CLI_FAIL === kind) { console.error('[fake-cli] error'); process.exit(1) }
else if (process.env.FAKE_CLI_SOFT_FAIL === kind) { console.log('× 上传'); console.log('[error] 需要重新登录'); console.log('[info] Exit') }
else {
  if (get('--qr-output')) fs.writeFileSync(get('--qr-output'), 'QUJD')
  if (get('--info-output')) fs.writeFileSync(get('--info-output'), JSON.stringify({ size: { total: 2048 } }))
}
`

const BUILD_JS = `
const fs = require('fs')
if (process.env.FAKE_BUILD_FAIL === '1') { console.error('build failed'); process.exit(2) }
fs.mkdirSync('dist', { recursive: true })
fs.writeFileSync('dist/project.config.json', JSON.stringify({ appid: process.env.FAKE_BUILD_APPID || 'wxdist' }))
console.log('built')
`

let dir: string
let app: string
let logFile: string
let runner: RunnerService
let release: ReleaseService
let ctx: ReleaseContext
const ENV_KEYS = ['FAKE_CLI_LOG', 'FAKE_CLI_FAIL', 'FAKE_CLI_SOFT_FAIL', 'FAKE_CLI_SLOW', 'FAKE_BUILD_FAIL', 'FAKE_BUILD_APPID']

const waitFor = async (check: () => boolean, timeoutMs = 20_000) => {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 50))
  }
}

const finished = async (jobId: string): Promise<ReleaseJob> => {
  let job: ReleaseJob | undefined
  await waitFor(() => {
    job = release.list().find((j) => j.jobId === jobId)
    return Boolean(job && job.status !== 'running')
  })
  return job as ReleaseJob
}

const cliCalls = (): { args: string[]; token: string | null }[] => {
  try {
    return readFileSync(logFile, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

const previewReq = (build: ReleaseRequest['build']): ReleaseRequest => ({ projectId: 'p', action: 'preview', build })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wb-rel-'))
  app = join(dir, 'app')
  mkdirSync(app)
  writeFileSync(join(dir, 'fake-cli.js'), FAKE_CLI_JS)
  writeFileSync(join(dir, 'cli.bat'), '@node "%~dp0fake-cli.js" %*\r\n')
  writeFileSync(join(app, 'build.js'), BUILD_JS)
  writeFileSync(join(app, 'package.json'), JSON.stringify({ scripts: { 'build:weapp': 'node build.js' } }))
  writeFileSync(join(app, 'project.config.json'), JSON.stringify({ appid: 'wxroot', miniprogramRoot: 'dist/' }))
  logFile = join(dir, 'cli.log')
  process.env.FAKE_CLI_LOG = logFile
  runner = new RunnerService({ flushMs: 20 })
  release = new ReleaseService(runner, { tmpRoot: join(dir, 'tmp') })
  ctx = { repoPath: app, root: app, cli: join(dir, 'cli.bat') }
})

afterEach(async () => {
  await release.cancelAll()
  await runner.stopAll()
  for (const k of ENV_KEYS) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

describe('ReleaseService', () => {
  it('builds then previews and returns the qr code', async () => {
    const changes: ReleaseJob[] = []
    release.on('changed', (j: ReleaseJob) => changes.push(j))
    const started = await release.start(previewReq({ kind: 'script', script: 'build:weapp' }), { ...ctx, token: 'tok' })
    expect(started.steps.map((s) => s.status)).toEqual(['pending', 'pending'])

    const job = await finished(started.jobId)
    expect(job.status).toBe('ok')
    expect(job.steps.map((s) => s.status)).toEqual(['ok', 'ok'])
    expect(job.qrDataUrl).toBe('data:image/png;base64,QUJD')
    expect(job.appid).toBe('wxdist')
    expect(job.packageSize).toBe(2048)
    expect(job.steps.every((s) => s.runId)).toBe(true)

    const [call] = cliCalls()
    expect(call.args.slice(0, 3)).toEqual(['preview', '--project', join(app, 'dist')])
    expect(call.token).toBe('tok')
    expect(changes.length).toBeGreaterThanOrEqual(4)
  })

  it('uploads with version and description', async () => {
    const started = await release.start(
      { projectId: 'p', action: 'upload', build: { kind: 'skip' }, version: '1.2.3', desc: 'fix "a"', expectedAppid: 'wxroot' },
      ctx
    )
    expect(started.steps.map((s) => s.status)).toEqual(['skipped', 'pending'])
    const job = await finished(started.jobId)
    expect(job.status).toBe('ok')
    expect(job.upload).toEqual({ version: '1.2.3', desc: "fix 'a'" })
    const [call] = cliCalls()
    expect(call.args).toEqual(
      expect.arrayContaining(['upload', '--project', app, '-v', '1.2.3', '-d', "fix 'a'", '--lang', 'zh'])
    )
  })

  it('stops when the build fails', async () => {
    process.env.FAKE_BUILD_FAIL = '1'
    const started = await release.start(previewReq({ kind: 'script', script: 'build:weapp' }), ctx)
    const job = await finished(started.jobId)
    expect(job.status).toBe('failed')
    expect(job.error?.code).toBe('STEP_FAILED')
    expect(job.steps.map((s) => s.status)).toEqual(['failed', 'skipped'])
    expect(cliCalls()).toEqual([])
  })

  it('reports a failing cli step', async () => {
    process.env.FAKE_CLI_FAIL = 'preview'
    const started = await release.start(previewReq({ kind: 'skip' }), ctx)
    const job = await finished(started.jobId)
    expect(job.status).toBe('failed')
    expect(job.steps[1].status).toBe('failed')
    expect(job.qrDataUrl).toBeUndefined()
  })

  it('treats [error] output as failure even when the cli exits with 0', async () => {
    process.env.FAKE_CLI_SOFT_FAIL = 'upload'
    const started = await release.start(
      { projectId: 'p', action: 'upload', build: { kind: 'skip' }, version: '1.0.0', desc: 'd' },
      ctx
    )
    const job = await finished(started.jobId)
    expect(job.status).toBe('failed')
    expect(job.error).toMatchObject({ code: 'WECHAT_CLI_ERROR', message: '需要重新登录' })
    expect(job.steps[1].status).toBe('failed')
    expect(job.upload).toBeUndefined()
  })

  it('runs build-npm for native projects', async () => {
    const started = await release.start(previewReq({ kind: 'npm' }), ctx)
    const job = await finished(started.jobId)
    expect(job.status).toBe('ok')
    expect(cliCalls().map((c) => c.args[0])).toEqual(['build-npm', 'preview'])
  })

  it('refuses to upload when the appid changes after building', async () => {
    process.env.FAKE_BUILD_APPID = 'wxother'
    const started = await release.start(
      {
        projectId: 'p',
        action: 'upload',
        build: { kind: 'script', script: 'build:weapp' },
        version: '1.0.1',
        desc: 'd',
        expectedAppid: 'wxroot'
      },
      ctx
    )
    const job = await finished(started.jobId)
    expect(job.status).toBe('failed')
    expect(job.error?.code).toBe('APPID_CHANGED')
    expect(job.steps.map((s) => s.status)).toEqual(['ok', 'skipped'])
    expect(cliCalls()).toEqual([])
  })

  it('cancels the running step', async () => {
    process.env.FAKE_CLI_SLOW = '1'
    const started = await release.start(previewReq({ kind: 'skip' }), ctx)
    await waitFor(() => cliCalls().length === 1)
    await expect(release.start(previewReq({ kind: 'skip' }), ctx)).rejects.toMatchObject({ code: 'RELEASE_RUNNING' })
    await release.cancel(started.jobId)
    const job = await finished(started.jobId)
    expect(job.status).toBe('cancelled')
    expect(job.steps[1].status).toBe('cancelled')
    expect(job.error).toBeUndefined()
  })

  it('validates input before starting', async () => {
    await expect(release.start(previewReq({ kind: 'skip' }), { ...ctx, cli: undefined })).rejects.toMatchObject({
      code: 'WECHAT_CLI_NOT_CONFIGURED'
    })
    await expect(
      release.start(previewReq({ kind: 'skip' }), { ...ctx, cli: join(dir, 'missing.bat') })
    ).rejects.toMatchObject({ code: 'WECHAT_CLI_NOT_FOUND' })
    await expect(
      release.start({ projectId: 'p', action: 'upload', build: { kind: 'skip' }, version: '1.2', desc: 'd' }, ctx)
    ).rejects.toMatchObject({ code: 'INVALID_VERSION' })
    await expect(release.start(previewReq({ kind: 'skip' }), { ...ctx, root: dir })).rejects.toMatchObject({
      code: 'PROJECT_CONFIG_NOT_FOUND'
    })
    expect(release.list()).toEqual([])
  })
})
