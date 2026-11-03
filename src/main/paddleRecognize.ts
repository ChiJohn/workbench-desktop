import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseOcrResult } from '../core/ocr/parseResult'
import type { InboxRecognition } from '../core/knowledge/inbox'

const HOST = '127.0.0.1'
const PORT = Number(process.env.WORKBENCH_OCR_PORT || 17890)
const BASE = `http://${HOST}:${PORT}`
const START_TIMEOUT_MS = 120_000
const TEXT_TIMEOUT_MS = 180_000
const MEANING_TIMEOUT_MS = 600_000
const PROBE_TIMEOUT_MS = 120_000
const HEALTH_POLL_MS = 400

let child: ChildProcess | null = null
let starting: Promise<void> | null = null
let pythonWithPaddle: string | null = null

/** 本机有 OCR 服务就识别；没有就把原因带回，不挡住归档 */
export async function recognizeImage(imagePath: string): Promise<InboxRecognition> {
  try {
    await ensureOcrService()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { text: '', meaning: '', warning: message }
  }
  const textResult = await postOcr(imagePath, 'text', TEXT_TIMEOUT_MS, '文字')
  const meaningResult = await postOcr(imagePath, 'meaning', MEANING_TIMEOUT_MS, '图意')
  const warning = [textResult.error, meaningResult.error].filter(Boolean).join('；')
  return {
    text: textResult.text.trim(),
    meaning: meaningResult.meaning.trim(),
    warning: warning || undefined
  }
}

export function stopOcrService(): void {
  if (!child?.pid) {
    child = null
    return
  }
  killTree(child.pid)
  child = null
}

export async function ensureOcrService(): Promise<void> {
  const status = await health()
  if (status?.ok) {
    if (status.paddle === false) throw new Error('本机 Python 没有安装 paddleocr，图片已归档，文字和图意没有识别')
    return
  }
  if (starting) return starting
  starting = startServer().finally(() => {
    starting = null
  })
  return starting
}

function serverScript(): string {
  const candidates = [
    join(process.resourcesPath || '', 'ocr-server', 'server.py'),
    join(app.getAppPath(), 'ocr-server', 'server.py'),
    join(__dirname, '../../ocr-server/server.py'),
    join(process.cwd(), 'ocr-server', 'server.py')
  ]
  const found = candidates.find((path) => path && existsSync(path))
  if (!found) throw new Error('没有找到 OCR 服务脚本 ocr-server/server.py')
  return found
}

async function startServer(): Promise<void> {
  const existing = await health()
  if (existing?.ok) {
    if (existing.paddle === false) throw new Error('本机 Python 没有安装 paddleocr，图片已归档，文字和图意没有识别')
    return
  }
  const python = await findPython()
  if (!python) throw new Error('本机没有 Python，图片已归档，文字和图意没有识别')
  const script = serverScript()
  if (child?.pid) killTree(child.pid)
  child = spawn(python, [script], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, WORKBENCH_OCR_PORT: String(PORT) }
  })
  child.stderr?.setEncoding('utf8')
  let bootLog = ''
  child.stderr?.on('data', (chunk: string) => {
    bootLog = (bootLog + chunk).slice(-2000)
  })
  child.once('exit', () => {
    child = null
  })
  child.once('error', () => {
    child = null
  })
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    const status = await health()
    if (status?.ok) {
      if (status.paddle === false) {
        stopOcrService()
        throw new Error('本机 Python 没有安装 paddleocr，图片已归档，文字和图意没有识别')
      }
      return
    }
    if (!child) {
      const reused = await health()
      if (reused?.ok) {
        if (reused.paddle === false) throw new Error('本机 Python 没有安装 paddleocr，图片已归档，文字和图意没有识别')
        return
      }
      throw new Error(`OCR 服务启动失败${bootLog.trim() ? `：${bootLog.trim().slice(-300)}` : ''}`)
    }
    await sleep(HEALTH_POLL_MS)
  }
  stopOcrService()
  throw new Error('OCR 服务启动超时')
}

async function health(): Promise<{ ok: boolean; paddle?: boolean } | null> {
  try {
    const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2_000) })
    if (!response.ok) return null
    return (await response.json()) as { ok: boolean; paddle?: boolean }
  } catch {
    return null
  }
}

async function postOcr(
  imagePath: string,
  mode: 'text' | 'meaning' | 'all',
  timeoutMs: number,
  label: string
): Promise<{ text: string; meaning: string; error?: string }> {
  try {
    const response = await fetch(`${BASE}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: imagePath, mode }),
      signal: AbortSignal.timeout(timeoutMs)
    })
    const raw = await response.text()
    const parsed = parseOcrResult(raw)
    if (!response.ok && !parsed.error) {
      return { text: '', meaning: '', error: `${label}识别没有完成：HTTP ${response.status}` }
    }
    return parsed
  } catch (error) {
    return {
      text: '',
      meaning: '',
      error: `${label}识别没有完成：${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/** 优先用已经装了 paddleocr 的解释器。Windows 上 `py` 默认可能是 3.14，Paddle 没有这个版本的包。 */
async function findPython(): Promise<string | null> {
  if (pythonWithPaddle) return pythonWithPaddle
  const candidates =
    process.platform === 'win32'
      ? [['py', '-3.13'], ['py', '-3.12'], ['py', '-3.11'], ['py', '-3.10'], ['py', '-3'], ['python']]
      : [['python3'], ['python']]
  let fallback: string | null = null
  for (const cmd of candidates) {
    const [bin, ...prefix] = cmd
    const withPaddle = await run(bin, [...prefix, '-c', 'import paddleocr, sys; print(sys.executable)'], PROBE_TIMEOUT_MS).catch(() => '')
    const exe = lastLine(withPaddle)
    if (exe) {
      pythonWithPaddle = exe
      return exe
    }
    if (!fallback) {
      const found = await run(bin, [...prefix, '-c', 'import sys; print(sys.executable)'], PROBE_TIMEOUT_MS).catch(() => '')
      fallback = lastLine(found)
    }
  }
  return fallback
}

function lastLine(text: string): string | null {
  const line = text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1)
  return line || null
}

function run(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      killTree(proc.pid)
      reject(new Error('识别超时'))
    }, timeoutMs)
    proc.stdout?.setEncoding('utf8')
    proc.stderr?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => (stdout += chunk))
    proc.stderr?.on('data', (chunk: string) => (stderr += chunk))
    proc.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0 && !stdout.trim()) reject(new Error(stderr.trim().slice(-500) || `退出码 ${code}`))
      else resolve(stdout.trim())
    })
  })
}

function killTree(pid: number | undefined): void {
  if (!pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    return
  }
  try {
    process.kill(pid)
  } catch {
    /* already gone */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
