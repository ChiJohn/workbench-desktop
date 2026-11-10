import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '../util/result.js'
import { execShellCommand } from '../util/exec.js'
import { buildCliCommand } from './cliCommand.js'
import { detectCliError } from './cliOutput.js'
import { detectWechatCli } from './devtoolsPath.js'
import { readScripts } from './packageScripts.js'
import { resolveProjectDir } from './projectDir.js'
import { qrToDataUrl } from './qrDataUrl.js'
import { defaultVersion, detectEnvs, isValidVersion, sanitizeDesc } from './releaseConfig.js'

export interface DetectEnvResult {
  cliPath?: string | undefined
  root: string
  dir: string
  appid: string | null
  projectname: string | null
  packageManager: string
  envs: { script: string; label: string }[]
  defaultVersion: string
}

export async function detectReleaseEnv(projectDir?: string, explicitCli?: string): Promise<DetectEnvResult> {
  const root = projectDir || process.cwd()
  const cliPath = explicitCli || (await detectWechatCli())
  const dirInfo = await resolveProjectDir(root)
  const scriptsInfo = await readScripts(root)
  const envs = detectEnvs(scriptsInfo.scripts)
  const defVer = defaultVersion(undefined, scriptsInfo.version)

  return {
    cliPath,
    root: dirInfo.root,
    dir: dirInfo.dir,
    appid: dirInfo.appid,
    projectname: dirInfo.projectname,
    packageManager: scriptsInfo.pm,
    envs,
    defaultVersion: defVer
  }
}

export interface PreviewOptions {
  projectDir: string
  buildScript?: string | undefined
  cliPath?: string | undefined
  token?: string | undefined
}

export interface PreviewResult {
  appid: string | null
  qrDataUrl: string
  packageSize?: number | undefined
  durationMs: number
}

export interface UploadOptions {
  projectDir: string
  version: string
  desc: string
  buildScript?: string | undefined
  cliPath?: string | undefined
  token?: string | undefined
}

export interface UploadResult {
  appid: string | null
  version: string
  desc: string
  packageSize?: number | undefined
  durationMs: number
}

async function readPackageSize(infoPath: string): Promise<number | undefined> {
  try {
    const raw = await readFile(infoPath, 'utf8')
    const info = JSON.parse(raw) as { size?: { total?: number } }
    return typeof info.size?.total === 'number' ? info.size.total : undefined
  } catch {
    return undefined
  }
}

async function resolveCli(explicitCli?: string): Promise<string> {
  const cli = explicitCli || (await detectWechatCli())
  if (!cli) {
    throw new AppError('WECHAT_CLI_NOT_FOUND', '未找到微信开发者工具 cli.bat，请安装微信开发者工具或显式指定 cli 路径')
  }
  if (!existsSync(cli)) {
    throw new AppError('WECHAT_CLI_NOT_FOUND', `指定的微信开发者工具 cli.bat 不存在：${cli}`, cli)
  }
  return cli
}

export async function runPreview(opts: PreviewOptions): Promise<PreviewResult> {
  const start = Date.now()
  const cli = await resolveCli(opts.cliPath)
  const dirInfo = await resolveProjectDir(opts.projectDir)

  // 构建步骤
  if (opts.buildScript && opts.buildScript !== 'skip') {
    if (opts.buildScript === 'npm') {
      const npmCmd = buildCliCommand(cli, { kind: 'build-npm', projectDir: dirInfo.dir })
      const res = await execShellCommand(npmCmd, { cwd: dirInfo.root })
      const err = detectCliError(res.stdout + '\n' + res.stderr)
      if (err) throw new AppError(err.code, err.message, err.detail)
      if (res.code !== 0) throw new AppError('BUILD_FAILED', `构建 npm 失败（退出码 ${res.code}）`, res.stderr)
    } else {
      const scripts = await readScripts(dirInfo.root)
      const res = await execShellCommand(`${scripts.pm} run "${opts.buildScript}"`, { cwd: dirInfo.root })
      if (res.code !== 0) throw new AppError('BUILD_FAILED', `执行构建脚本 ${opts.buildScript} 失败（退出码 ${res.code}）`, res.stderr)
    }
  }

  const tmp = join(tmpdir(), 'dsh-workbench-release', randomUUID())
  await mkdir(tmp, { recursive: true })
  const qrOutput = join(tmp, 'qr.txt')
  const infoOutput = join(tmp, 'info.json')

  try {
    const env: Record<string, string> = opts.token ? { WECHAT_DEVTOOLS_CLI_TOKEN: opts.token } : {}
    const cmd = buildCliCommand(cli, {
      kind: 'preview',
      projectDir: dirInfo.dir,
      qrOutput,
      infoOutput
    })
    const res = await execShellCommand(cmd, { cwd: dirInfo.root, env })
    const err = detectCliError(res.stdout + '\n' + res.stderr)
    if (err) throw new AppError(err.code, err.message, err.detail)
    if (res.code !== 0) throw new AppError('PREVIEW_FAILED', `预览命令执行失败（退出码 ${res.code}）`, res.stdout + '\n' + res.stderr)

    if (!existsSync(qrOutput)) {
      throw new AppError('QR_NOT_FOUND', '预览成功但未生成二维码文件', qrOutput)
    }
    const qrBuffer = await readFile(qrOutput)
    const qrData = qrToDataUrl(qrBuffer)
    const packageSize = await readPackageSize(infoOutput)

    return {
      appid: dirInfo.appid,
      qrDataUrl: qrData,
      packageSize,
      durationMs: Date.now() - start
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function runUpload(opts: UploadOptions): Promise<UploadResult> {
  const start = Date.now()
  if (!isValidVersion(opts.version)) {
    throw new AppError('INVALID_VERSION', `版本号需要是 x.y.z 语义化格式：${opts.version}`)
  }
  const desc = sanitizeDesc(opts.desc)
  if (!desc) {
    throw new AppError('INVALID_DESC', '请填写上传描述')
  }

  const cli = await resolveCli(opts.cliPath)
  const dirInfo = await resolveProjectDir(opts.projectDir)

  // 构建步骤
  if (opts.buildScript && opts.buildScript !== 'skip') {
    if (opts.buildScript === 'npm') {
      const npmCmd = buildCliCommand(cli, { kind: 'build-npm', projectDir: dirInfo.dir })
      const res = await execShellCommand(npmCmd, { cwd: dirInfo.root })
      const err = detectCliError(res.stdout + '\n' + res.stderr)
      if (err) throw new AppError(err.code, err.message, err.detail)
      if (res.code !== 0) throw new AppError('BUILD_FAILED', `构建 npm 失败（退出码 ${res.code}）`, res.stderr)
    } else {
      const scripts = await readScripts(dirInfo.root)
      const res = await execShellCommand(`${scripts.pm} run "${opts.buildScript}"`, { cwd: dirInfo.root })
      if (res.code !== 0) throw new AppError('BUILD_FAILED', `执行构建脚本 ${opts.buildScript} 失败（退出码 ${res.code}）`, res.stderr)
    }
  }

  const tmp = join(tmpdir(), 'dsh-workbench-release', randomUUID())
  await mkdir(tmp, { recursive: true })
  const infoOutput = join(tmp, 'info.json')

  try {
    const env: Record<string, string> = opts.token ? { WECHAT_DEVTOOLS_CLI_TOKEN: opts.token } : {}
    const cmd = buildCliCommand(cli, {
      kind: 'upload',
      projectDir: dirInfo.dir,
      version: opts.version,
      desc,
      infoOutput
    })
    const res = await execShellCommand(cmd, { cwd: dirInfo.root, env })
    const err = detectCliError(res.stdout + '\n' + res.stderr)
    if (err) throw new AppError(err.code, err.message, err.detail)
    if (res.code !== 0) throw new AppError('UPLOAD_FAILED', `上传命令执行失败（退出码 ${res.code}）`, res.stdout + '\n' + res.stderr)

    const packageSize = await readPackageSize(infoOutput)
    return {
      appid: dirInfo.appid,
      version: opts.version,
      desc,
      packageSize,
      durationMs: Date.now() - start
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined)
  }
}
