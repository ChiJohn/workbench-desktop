import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InboxRecognition } from '../core/knowledge/inbox'

const TIMEOUT_MS = 180_000

const SCRIPT = `
import json, sys
path = sys.argv[1]
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

try:
    from paddleocr import PaddleOCR
    ocr = PaddleOCR(lang="ch")
    if hasattr(ocr, "predict"):
        text = texts_from(ocr.predict(path))
    else:
        text = texts_from(ocr.ocr(path, cls=False))
except Exception as exc:
    errors.append("文字识别失败：" + str(exc))

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
    const raw = await run(python, [script, imagePath])
    const parsed = JSON.parse(raw) as { text?: string; meaning?: string; error?: string }
    return {
      text: parsed.text?.trim() || '',
      meaning: parsed.meaning?.trim() || '',
      warning: parsed.error?.trim() || undefined
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { text: '', meaning: '', warning: `识别没有完成：${message}` }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function findPython(): Promise<string | null> {
  for (const cmd of process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']) {
    const ok = await run(cmd, ['-c', 'import sys; print(sys.executable)']).then(() => true).catch(() => false)
    if (ok) return cmd
  }
  return null
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('识别超时'))
    }, TIMEOUT_MS)
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
      if (code !== 0 && !stdout.trim()) reject(new Error(stderr.trim() || `退出码 ${code}`))
      else resolve(stdout.trim())
    })
  })
}
