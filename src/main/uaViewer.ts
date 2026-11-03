import { app } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '../core/result'
import { startUaViewerServer, type UaViewerServerHandle } from '../core/ua/viewerServer'
import { UA_VIEWER_PACKAGE } from '../core/ua/viewerUrl'

interface Session {
  handle: UaViewerServerHandle
  graphDir: string
}

function findViewerDist(homeDir = homedir()): string | null {
  const candidates = [
    join(homeDir, '.understand-anything', 'repo', 'understand-anything-plugin', 'packages', 'viewer', 'dist'),
    join(app.getPath('userData'), 'ua-viewer', 'package', 'dist')
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir
  }
  return null
}

function downloadAndExtractViewerDist(): Promise<string> {
  const cacheDir = join(app.getPath('userData'), 'ua-viewer')
  mkdirSync(cacheDir, { recursive: true })
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-Command',
        `$tgz = Join-Path '${cacheDir.replace(/'/g, "''")}' 'viewer.tgz'; Invoke-WebRequest -UseBasicParsing -Uri '${UA_VIEWER_PACKAGE}' -OutFile $tgz; tar -xzf $tgz -C '${cacheDir.replace(/'/g, "''")}'`
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let stderr = ''
    child.stderr?.on('data', (c) => (stderr += String(c)))
    child.on('error', (err) => reject(new AppError('UA_VIEWER_DOWNLOAD', `下载 UA 看板失败：${err.message}`)))
    child.on('close', (code) => {
      const dist = join(cacheDir, 'package', 'dist')
      if (code === 0 && existsSync(join(dist, 'index.html'))) resolve(dist)
      else reject(new AppError('UA_VIEWER_DOWNLOAD', '下载或解压 UA 看板失败', stderr.trim() || undefined))
    })
  })
}

/**
 * 在主进程内启动只读 UA 看板 HTTP 服务，支持图谱存放在 Obsidian Vault、源码仍从项目仓库只读预览。
 */
export class UaViewerHost {
  private readonly sessions = new Map<string, Session>()
  private readonly starting = new Map<string, Promise<string>>()
  private downloadingDist: Promise<string> | null = null

  async open(
    key: string,
    opts: { graphDir: string | null; repoPath: string; missingHint?: string }
  ): Promise<string> {
    if (!opts.graphDir || !existsSync(join(opts.graphDir, 'knowledge-graph.json'))) {
      throw new AppError(
        'UA_GRAPH_MISSING',
        opts.missingHint ?? '还没有找到 UA 图谱。请先点「在终端生成图谱」生成并收纳到 Vault。'
      )
    }

    const live = this.sessions.get(key)
    if (live) {
      if (live.graphDir === opts.graphDir) return live.handle.url
      await this.stop(key)
    }

    const pending = this.starting.get(key)
    if (pending) return pending

    const graphDir = opts.graphDir
    const job = this.launch(key, graphDir, opts.repoPath)
    this.starting.set(key, job)
    return job.finally(() => this.starting.delete(key))
  }

  runningUrl(key: string): string | null {
    return this.sessions.get(key)?.handle.url ?? null
  }

  async stop(key: string): Promise<void> {
    const live = this.sessions.get(key)
    if (!live) return
    this.sessions.delete(key)
    await live.handle.close().catch(() => undefined)
  }

  killAll(): void {
    for (const [key, session] of this.sessions) {
      void session.handle.close().catch(() => undefined)
      this.sessions.delete(key)
    }
  }

  private async ensureDist(): Promise<string> {
    const existing = findViewerDist()
    if (existing) return existing
    if (!this.downloadingDist) {
      this.downloadingDist = downloadAndExtractViewerDist().finally(() => {
        this.downloadingDist = null
      })
    }
    return this.downloadingDist
  }

  private async launch(key: string, graphDir: string, repoPath: string): Promise<string> {
    const distDir = await this.ensureDist()
    const handle = await startUaViewerServer({ graphDir, repoPath, distDir })
    this.sessions.set(key, { handle, graphDir })
    return handle.url
  }
}
