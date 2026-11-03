import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { basename, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { execCommand } from '../exec'
import { isUaGraphStale } from './viewerUrl'

const MAX_SOURCE_FILE_BYTES = 1024 * 1024

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

const BY_EXT: Record<string, string> = {
  bash: 'bash',
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  go: 'go',
  h: 'c',
  hpp: 'cpp',
  html: 'markup',
  java: 'java',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  md: 'markdown',
  mjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  ts: 'typescript',
  tsx: 'tsx',
  txt: 'text',
  yaml: 'yaml',
  yml: 'yaml'
}

const PROTECTED = new Set([
  '/knowledge-graph.json',
  '/domain-graph.json',
  '/diff-overlay.json',
  '/meta.json',
  '/config.json',
  '/file-content.json',
  '/staleness.json'
])

export interface UaViewerServerHandle {
  url: string
  close(): Promise<void>
}

export interface StartUaViewerOptions {
  /** 图谱 JSON 所在目录（如 Vault 中的 `项目/<名称>/.ua`） */
  graphDir: string
  /** 源代码所在仓库目录（用于在看板点击节点时只读预览源码及检查 git 新鲜度） */
  repoPath: string
  /** understand-anything-viewer 的前端静态资源目录（含 index.html） */
  distDir: string
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function normalizeRelToRepo(filePath: string, repoRoot: string): string | null {
  const rawPath = isAbsolute(filePath)
    ? filePath.startsWith(repoRoot)
      ? relative(repoRoot, filePath)
      : null
    : filePath
  if (rawPath === null) return null
  const norm = normalize(rawPath)
  if (!norm || norm === '.' || norm.includes('\0') || norm === '..' || norm.startsWith(`..${sep}`) || isAbsolute(norm)) {
    return null
  }
  return norm.split(sep).join('/')
}

function collectAllowedFiles(graphDir: string, repoRoot: string): Set<string> {
  const allowed = new Set<string>()
  try {
    const raw = JSON.parse(readFileSync(join(graphDir, 'knowledge-graph.json'), 'utf8')) as {
      nodes?: Array<{ filePath?: unknown }>
    }
    for (const node of raw.nodes ?? []) {
      if (typeof node.filePath !== 'string') continue
      const norm = normalizeRelToRepo(node.filePath, repoRoot)
      if (norm) allowed.add(norm)
    }
  } catch {
    // ignore
  }
  return allowed
}

function readSourceFile(reqUrl: URL, graphDir: string, repoRoot: string): { statusCode: number; payload: unknown } {
  const reject = (message: string, statusCode = 400) => ({ statusCode, payload: { error: message } })
  const requested = reqUrl.searchParams.get('path') ?? ''
  if (!requested) return reject('Missing path')
  if (requested.includes('\0')) return reject('Invalid path')
  if (isAbsolute(requested)) return reject('Absolute paths are not allowed')

  const norm = normalize(requested)
  if (norm === '.' || norm === '..' || norm.startsWith(`..${sep}`) || isAbsolute(norm)) {
    return reject('Path must stay inside the project')
  }

  const absFile = resolve(repoRoot, norm)
  const rel = relative(repoRoot, absFile)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return reject('Path must stay inside the project')
  }
  const safeRel = rel.split(sep).join('/')
  if (!collectAllowedFiles(graphDir, repoRoot).has(safeRel)) {
    return reject('File is not in the knowledge graph', 404)
  }

  let st
  try {
    st = statSync(absFile)
  } catch {
    return reject('File not found', 404)
  }
  if (!st.isFile()) return reject('Path is not a file')
  if (st.size > MAX_SOURCE_FILE_BYTES) return reject('File is too large to preview', 413)

  const buf = readFileSync(absFile)
  if (buf.includes(0)) return reject('Binary files cannot be previewed', 415)

  const content = buf.toString('utf8')
  const ext = extname(rel).slice(1).toLowerCase()
  return {
    statusCode: 200,
    payload: {
      path: safeRel,
      language: BY_EXT[ext] ?? 'text',
      content,
      sizeBytes: buf.byteLength,
      lineCount: content.length === 0 ? 0 : content.split(/\r\n|\n|\r/).length
    }
  }
}

function serveGraphJson(res: ServerResponse, graphDir: string, repoRoot: string, fileName: string): void {
  const candidate = join(graphDir, fileName)
  if (existsSync(candidate)) {
    try {
      const raw = JSON.parse(readFileSync(candidate, 'utf8')) as {
        nodes?: Array<Record<string, unknown>>
      }
      if (Array.isArray(raw.nodes)) {
        raw.nodes = raw.nodes.map((node) => {
          if (typeof node.filePath !== 'string') return node
          const abs = node.filePath
          const rel = abs.startsWith(repoRoot)
            ? abs.slice(repoRoot.length).replace(/^[\\/]+/, '').replace(/\\/g, '/')
            : isAbsolute(abs)
              ? basename(abs)
              : abs
          return { ...node, filePath: rel }
        })
      }
      sendJson(res, 200, raw)
    } catch {
      sendJson(res, 500, { error: 'Failed to read graph file' })
    }
    return
  }
  if (fileName === 'knowledge-graph.json') {
    sendJson(res, 404, { error: 'No knowledge graph found.' })
  } else {
    res.statusCode = 404
    res.end()
  }
}

async function computeFreshness(graphDir: string, repoRoot: string): Promise<{ statusCode: number; payload: unknown }> {
  const kgPath = join(graphDir, 'knowledge-graph.json')
  if (!existsSync(kgPath)) return { statusCode: 404, payload: { error: 'No knowledge graph found.' } }

  let graphCommit: string | undefined
  let analyzedAt: string | undefined
  try {
    const kg = JSON.parse(readFileSync(kgPath, 'utf8')) as {
      project?: { gitCommitHash?: unknown; analyzedAt?: unknown }
    }
    if (typeof kg.project?.gitCommitHash === 'string' && kg.project.gitCommitHash.trim()) {
      graphCommit = kg.project.gitCommitHash.trim()
    }
    if (typeof kg.project?.analyzedAt === 'string' && kg.project.analyzedAt.trim()) {
      analyzedAt = kg.project.analyzedAt.trim()
    }
  } catch {
    return { statusCode: 500, payload: { error: 'Failed to read graph file' } }
  }

  if (!graphCommit) {
    return {
      statusCode: 200,
      payload: { graphs: { knowledge: { status: 'unknown', reason: 'missing-graph-commit', lastAnalyzedAt: analyzedAt } } }
    }
  }

  const headRes = await execCommand('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, timeoutMs: 4000 }).catch(() => null)
  const head = headRes?.code === 0 ? headRes.stdout.trim() : ''
  if (!head) {
    return {
      statusCode: 200,
      payload: {
        graphs: {
          knowledge: {
            status: 'unknown',
            reason: 'git-head-unavailable',
            graphCommitHash: graphCommit,
            lastAnalyzedAt: analyzedAt
          }
        }
      }
    }
  }

  if (isUaGraphStale(graphCommit, head)) {
    return {
      statusCode: 200,
      payload: {
        graphs: {
          knowledge: {
            status: 'stale',
            relation: 'behind',
            graphCommitHash: graphCommit,
            headCommitHash: head,
            changedFileCount: 1,
            changedFiles: [],
            commitsBehind: 1,
            commitsAhead: 0,
            lastAnalyzedAt: analyzedAt
          }
        }
      }
    }
  }

  return {
    statusCode: 200,
    payload: {
      graphs: {
        knowledge: {
          status: 'fresh',
          graphCommitHash: graphCommit,
          headCommitHash: head,
          changedFileCount: 0,
          changedFiles: [],
          commitsBehind: 0,
          commitsAhead: 0,
          lastAnalyzedAt: analyzedAt
        }
      }
    }
  }
}

function serveStatic(res: ServerResponse, distRoot: string, pathname: string): void {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const abs = resolve(distRoot, rel)
  if (abs !== distRoot && !abs.startsWith(distRoot + sep)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  res.setHeader('Content-Type', CONTENT_TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream')
  res.end(readFileSync(abs))
}

/**
 * 在 127.0.0.1 随机空闲端口启动只读 UA 看板服务，支持「图谱目录（Vault）」与「源码仓库目录（Repo）」分离。
 */
export function startUaViewerServer(opts: StartUaViewerOptions): Promise<UaViewerServerHandle> {
  const graphDir = resolve(opts.graphDir)
  const repoRoot = resolve(opts.repoPath)
  const distRoot = resolve(opts.distDir)
  const token = randomBytes(16).toString('hex')

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
    const pathname = reqUrl.pathname

    if (pathname === '/staleness.json') {
      res.setHeader('Cache-Control', 'no-store')
    }

    if (!PROTECTED.has(pathname)) {
      serveStatic(res, distRoot, pathname)
      return
    }

    if (reqUrl.searchParams.get('token') !== token) {
      sendJson(res, 403, { error: 'Forbidden: missing or invalid token' })
      return
    }

    if (pathname === '/file-content.json') {
      const r = readSourceFile(reqUrl, graphDir, repoRoot)
      sendJson(res, r.statusCode, r.payload)
      return
    }

    if (pathname === '/staleness.json') {
      void computeFreshness(graphDir, repoRoot)
        .then((r) => sendJson(res, r.statusCode, r.payload))
        .catch(() => sendJson(res, 500, { error: 'Failed to read graph freshness' }))
      return
    }

    if (pathname === '/config.json') {
      const cfg = join(graphDir, 'config.json')
      if (existsSync(cfg)) {
        try {
          sendJson(res, 200, JSON.parse(readFileSync(cfg, 'utf8')))
        } catch {
          sendJson(res, 500, { error: 'Failed to read config file' })
        }
        return
      }
      sendJson(res, 200, { autoUpdate: false, outputLanguage: 'zh' })
      return
    }

    serveGraphJson(res, graphDir, repoRoot, pathname.slice(1))
  })

  return new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      const url = `http://127.0.0.1:${port}/?token=${token}`
      resolvePromise({
        url,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done())
          })
      })
    })
  })
}
