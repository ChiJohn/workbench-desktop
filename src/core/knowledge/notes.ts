import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { AppError } from '../result'

export const KNOWLEDGE_DIR = '知识'
export const QA_DIR = '问答'
const DIRS = new Set([KNOWLEDGE_DIR, QA_DIR])
const TITLE_MAX = 40

const yamlString = (s: string) => `'${s.replace(/'/g, "''")}'`

export function noteFileName(date: string, title: string, suffix = ''): string {
  const safe = title
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^-+|-+$/g, '')
    .trim()
    .slice(0, TITLE_MAX)
  return `${date}-${safe || '未命名'}${suffix}.md`
}

export function renderKnowledge(input: { title: string; project?: string; task?: string; sources: string[]; body: string; created: string }): string {
  const lines = ['---', 'type: knowledge']
  if (input.project?.trim()) lines.push(`project: ${input.project.trim()}`)
  if (input.task?.trim()) lines.push(`task: ${input.task.trim()}`)
  if (input.sources.length) {
    lines.push('sources:')
    for (const source of input.sources) lines.push(`  - ${source}`)
  } else lines.push('sources: []')
  lines.push(`created: ${input.created}`, '---', '', `# ${input.title.trim()}`, '', input.body.trim(), '')
  return lines.join('\n')
}

export function renderQa(input: { question: string; project?: string; answer: string; sources: string[]; created: string }): string {
  const project = input.project?.trim()
  const sources = input.sources.length ? input.sources.map((s) => `- [[${s}]]`).join('\n') : '- （无）'
  return `---
type: qa
${project ? `project: ${project}\n` : ''}question: ${yamlString(input.question.trim())}
created: ${input.created}
---

# 问题

${input.question.trim()}

# 回答

${input.answer.trim()}

# 来源

${sources}
`
}

export async function saveNote(vaultPath: string, dir: string, content: string, date: string, title: string): Promise<string> {
  if (!DIRS.has(dir)) throw new AppError('KNOWLEDGE_PATH', '笔记只能写到「知识」或「问答」')
  const folder = join(vaultPath, dir)
  await mkdir(folder, { recursive: true })
  let name = noteFileName(date, title)
  for (let n = 2; existsSync(join(folder, name)); n++) name = noteFileName(date, title, `-${n}`)
  await writeFile(join(folder, name), content, { encoding: 'utf8', flag: 'wx' })
  return `${dir}/${name}`
}

/** 知识目录里 task 字段指向这条任务卡的笔记 */
export async function findDeposit(vaultPath: string, taskPath: string): Promise<string | null> {
  const folder = join(vaultPath, KNOWLEDGE_DIR)
  const names = await readdir(folder).catch(() => [])
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const md = await readFile(join(folder, name), 'utf8')
    const task = /^task:\s*(.+)$/m.exec(md)?.[1]?.trim().replace(/^'(.*)'$/, '$1')
    if (task === taskPath) return `${KNOWLEDGE_DIR}/${name}`
  }
  return null
}

export function todayStamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** 相对路径必须落在 vault 内。返回 posix 相对路径，否则 null */
export function vaultFile(vaultPath: string, rel: string): string | null {
  const cleaned = rel.replace(/\\/g, '/').trim()
  if (!cleaned || cleaned.startsWith('/') || /^[a-zA-Z]:/.test(cleaned) || cleaned.split('/').includes('..')) return null
  const root = resolve(vaultPath)
  const full = resolve(root, ...cleaned.split('/'))
  const back = relative(root, full)
  if (!back || back.startsWith('..') || back.includes(`..${sep}`)) return null
  if (!existsSync(full)) return null
  return back.split(sep).join('/')
}
