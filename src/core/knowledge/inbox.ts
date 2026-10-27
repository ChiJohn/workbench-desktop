import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { AppError } from '../result'
import { renderKnowledge, saveNote, todayStamp } from './notes'

export const INBOX_DIR = '附件/收件'
const MAX_BYTES = 20 * 1024 * 1024
const TEXT_LIMIT = 8000

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.xml', '.yml', '.yaml', '.html', '.htm'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
const SHEET_EXT = new Set(['.csv', '.xls', '.xlsx'])
const DOC_EXT = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', ...TEXT_EXT])

const RULES: [string, string[]][] = [
  ['排错', ['报错', '异常', 'exception', 'stack trace', 'typeerror', '失败原因']],
  ['接口', ['openapi', '接口', 'request body', '响应体']],
  ['需求', ['用户故事', '验收标准', '需求文档', '需求说明']],
  ['会议', ['会议纪要', '纪要', '会议记录']]
]

export interface InboxRecognition {
  text: string
  meaning: string
  warning?: string
}

export interface InboxItem {
  name: string
  category: string
  title: string
  notePath: string
  filePath: string
  warning?: string
  error?: string
}

export function classifyInbox(name: string, text: string): { category: string; title: string } {
  const ext = extname(name).toLowerCase()
  const haystack = `${name}\n${text}`.toLowerCase()
  const matched = RULES.find(([, words]) => words.some((word) => haystack.includes(word.toLowerCase())))
  const category = matched?.[0] ?? defaultCategory(ext)
  return { category, title: titleFrom(name, text) }
}

export function inboxBody(filePath: string, category: string, recognition: InboxRecognition, image: boolean): string {
  const lines = [`![[${filePath}]]`, '', '## 分类', '', category]
  if (image || recognition.text.trim()) {
    lines.push('', '## 识别', '', recognition.text.trim() || '（没有识别出文字）')
  }
  if (image) lines.push('', '## 图意', '', recognition.meaning.trim() || '（没有识别出图意）')
  if (!image && !recognition.text.trim()) lines.push('', '这个文件已存进附件，正文没有抽出文字。')
  return lines.join('\n')
}

export async function ingestDroppedFile(
  vault: string,
  sourcePath: string,
  recognizeImage: (savedPath: string) => Promise<InboxRecognition>,
  now = new Date()
): Promise<InboxItem> {
  const info = await stat(sourcePath).catch(() => null)
  if (!info) throw new AppError('INBOX_MISSING', '文件不存在')
  if (info.isDirectory()) throw new AppError('INBOX_DIRECTORY', '请拖入文件，不要拖文件夹')
  if (info.size > MAX_BYTES) throw new AppError('INBOX_TOO_LARGE', '文件超过 20MB，没有收进来')

  const name = basename(sourcePath)
  const ext = extname(name).toLowerCase()
  const day = todayStamp(now)
  const folder = join(vault, ...INBOX_DIR.split('/'), day)
  await mkdir(folder, { recursive: true })
  const storedName = await uniqueName(folder, safeFileName(name))
  const saved = join(folder, storedName)
  await copyFile(sourcePath, saved)
  const filePath = `${INBOX_DIR}/${day}/${storedName}`

  let recognition: InboxRecognition = { text: '', meaning: '' }
  if (IMAGE_EXT.has(ext)) {
    recognition = await recognizeImage(saved)
  } else if (TEXT_EXT.has(ext)) {
    recognition = { text: await readTextExcerpt(saved), meaning: '' }
  } else if (!DOC_EXT.has(ext) && !SHEET_EXT.has(ext)) {
    recognition = { text: '', meaning: '', warning: '这类文件只归档，不识别内容' }
  } else if (SHEET_EXT.has(ext) && ext !== '.csv') {
    recognition = { text: '', meaning: '', warning: '表格已归档，没有抽出单元格' }
  } else if (!TEXT_EXT.has(ext)) {
    recognition = { text: '', meaning: '', warning: '文件已归档，没有抽出正文' }
  }

  const { category, title } = classifyInbox(name, recognition.text)
  const created = todayStamp(now)
  const notePath = await saveNote(
    vault,
    '知识',
    renderKnowledge({
      title,
      sources: [filePath],
      body: inboxBody(filePath, category, recognition, IMAGE_EXT.has(ext)),
      created
    }),
    created,
    title
  )
  return { name, category, title, notePath, filePath, warning: recognition.warning }
}

function defaultCategory(ext: string): string {
  if (IMAGE_EXT.has(ext)) return '截图'
  if (SHEET_EXT.has(ext)) return '表格'
  if (DOC_EXT.has(ext)) return '文档'
  return '其他'
}

function titleFrom(name: string, text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.replace(/^#+\s*/, '').trim())
    .find((item) => item.length >= 2 && item.length <= 40 && !item.startsWith('![['))
  if (line) return line
  const stem = basename(name, extname(name)).trim()
  return stem || '未命名'
}

function safeFileName(name: string): string {
  const cleaned = basename(name).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
  return cleaned || '未命名'
}

async function uniqueName(folder: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = basename(name, ext)
  let candidate = name
  for (let n = 2; await exists(join(folder, candidate)); n++) candidate = `${stem}-${n}${ext}`
  return candidate
}

async function exists(path: string): Promise<boolean> {
  return Boolean(await stat(path).catch(() => null))
}

async function readTextExcerpt(path: string): Promise<string> {
  const raw = await readFile(path)
  if (raw.includes(0)) return ''
  const text = raw.toString('utf8').replace(/^\uFEFF/, '')
  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}\n…` : text
}
