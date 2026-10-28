import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InboxRecognition } from '../core/knowledge/inbox'

const TEXT_TIMEOUT_MS = 180_000
const MEANING_TIMEOUT_MS = 600_000
const PROBE_TIMEOUT_MS = 120_000

const SCRIPT = `
import json, os, sys
# Paddle 3.3 on Windows CPU hits an oneDNN bug. Plain inference still works.
os.environ["PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT"] = "0"
os.environ["PADDLE_PDX_MODEL_SOURCE"] = "modelscope"
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
path, mode = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "all"
text, meaning, errors = "", "", []

def texts_from(result):
    lines = []
    for item in result or []:
        data = item
        if hasattr(item, "json"):
            try:
                data = item.json
            except Exception:
                data = item
        if isinstance(data, dict):
            res = data.get("res") or data
            if isinstance(res, dict) and res.get("rec_texts"):
                lines.extend(str(x) for x in res.get("rec_texts") or [])
        elif isinstance(item, list):
            for line in item:
                if isinstance(line, list) and len(line) > 1 and isinstance(line[1], (list, tuple)) and line[1]:
                    lines.append(str(line[1][0]))
    return "\\n".join(x for x in lines if x).strip()

if mode in ("text", "all"):
    try:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(lang="ch")
        if hasattr(ocr, "predict"):
            text = texts_from(ocr.predict(path))
        else:
            text = texts_from(ocr.ocr(path, cls=False))
    except Exception as exc:
        errors.append("文字识别失败：" + str(exc))

if mode in ("meaning", "all"):
    try:
        from paddleocr import PaddleOCRVL
        vl = PaddleOCRVL()
        parts = []
        for item in vl.predict(path) or []:
            md = getattr(item, "markdown", None)
            if md is None and isinstance(item, dict):
                md = item.get("markdown")
            if isinstance(md, dict):
                parts.append(str(md.get("markdown_texts") or md.get("text") or ""))
            elif isinstance(md, str):
                parts.append(md)
        meaning = "\\n".join(x for x in parts if x).strip()
    except Exception as exc:
        errors.append("图意识别失败：" + str(exc))

print(json.dumps({"text": text, "meaning": meaning, "error": "；".join(errors)}, ensure_ascii=False))
`

/** 本机有 Paddle 就识别，没有就把原因带回，不挡住归档 */
export async function recognizeImage(imagePath: string): Promise<InboxRecognition> {
  const python = await findPython()
  if (!python) return { text: '', meaning: '', warning: '本机没有 Python，图片已归档，文字和图意没有识别' }
  const dir = await mkdtemp(join(tmpdir(), 'wb-paddle-'))
  const script = join(dir, 'recognize.py')
  try {
    await writeFile(script, SCRIPT, 'utf8')
    const textResult = await runJob(python, script, imagePath, 'text', TEXT_TIMEOUT_MS, '文字')
    const meaningResult = await runJob(python, script, imagePath, 'meaning', MEANING_TIMEOUT_MS, '图意')
    const warning = [textResult.error, meaningResult.error].filter(Boolean).join('；')
    return {
      text: textResult.text.trim(),
      meaning: meaningResult.meaning.trim(),
      warning: warning || undefined
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { text: '', meaning: '', warning: `识别没有完成：${message}` }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

let pythonWithPaddle: string | null = null

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

function runJob(
  python: string,
  script: string,
  imagePath: string,
  mode: string,
  timeoutMs: number,
  label: string
): Promise<{ text: string; meaning: string; error?: string }> {
  return run(python, [script, imagePath, mode], timeoutMs)
    .then((raw) => parseResult(raw))
    .catch((error: unknown) => ({
      text: '',
      meaning: '',
      error: `${label}识别没有完成：${error instanceof Error ? error.message : String(error)}`
    }))
}

function parseResult(raw: string): { text: string; meaning: string; error?: string } {
  const line = raw
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.startsWith('{'))
    .at(-1)
  if (!line) throw new Error(raw.trim().slice(0, 400) || '没有返回结果')
  const parsed = JSON.parse(line) as { text?: string; meaning?: string; error?: string }
  return { text: parsed.text || '', meaning: parsed.meaning || '', error: parsed.error?.trim() || undefined }
}

function run(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      killTree(child.pid)
      reject(new Error('识别超时'))
    }, timeoutMs)
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => (stdout += chunk))
    child.stderr?.on('data', (chunk: string) => (stderr += chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
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
