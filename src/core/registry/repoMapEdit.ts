import { TYPE_MAP, projectLinkName, splitRow } from './parseRepoMap'
import { normalizeRepoPath } from '../paths'
import { AppError } from '../result'
import { PROJECT_TYPE_LABELS, type ProjectType, type ProjectWriteRequest } from '../../shared/types'

const SECTION = /^##\s+已确认映射\s*$/
const NEXT_HEADING = /^#{1,2}\s/
const SEPARATOR = /^\|[\s:|-]+\|$/
const NAME_BAD = /[\\/|[\]#]/

export function writtenType(type: ProjectType, typeLabel?: string): string {
  const raw = typeLabel?.trim()
  if (raw) {
    const mapped = TYPE_MAP[raw.replace(/\s+/g, '')] ?? 'other'
    if (mapped === type) return raw
  }
  return PROJECT_TYPE_LABELS[type]
}

function newline(markdown: string): string {
  return markdown.includes('\r\n') ? '\r\n' : '\n'
}

function touchUpdated(markdown: string, today: string): string {
  const m = markdown.match(/^---\r?\n[\s\S]*?\r?\n---/)
  if (!m || !/^updated:/m.test(m[0])) return markdown
  return m[0].replace(/^updated:.*$/m, `updated: ${today}`) + markdown.slice(m[0].length)
}

function cellPath(cell: string): string | null {
  const m = cell.match(/`([^`]+)`/)
  return m ? m[1].trim() : null
}

interface RowHit {
  index: number
  name: string
  id: string
}

interface Table {
  lines: string[]
  /** 新行插入位置 */
  insertAt: number
  rows: RowHit[]
}

function readTable(markdown: string): Table {
  const lines = markdown.split(/\r?\n/)
  const section = lines.findIndex((l) => SECTION.test(l.trim()))
  if (section === -1) throw new AppError('MAP_NO_SECTION', '项目.md 里没有「已确认映射」，可以先初始化 vault')
  let header = -1
  for (let i = section + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (NEXT_HEADING.test(line)) break
    if (line.startsWith('|')) {
      header = i
      break
    }
  }
  if (header === -1) throw new AppError('MAP_NO_SECTION', '项目.md 里没有「已确认映射」，可以先初始化 vault')

  let cursor = header + 1
  if (cursor < lines.length && SEPARATOR.test(lines[cursor].trim())) cursor++
  const rows: RowHit[] = []
  let end = cursor
  for (let i = cursor; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('|') || NEXT_HEADING.test(line)) break
    end = i + 1
    const [linkCell = '', pathCell = ''] = splitRow(lines[i])
    const name = projectLinkName(linkCell)
    const repoPath = cellPath(pathCell)
    if (!name || !repoPath) continue
    rows.push({ index: i, name, id: normalizeRepoPath(repoPath) })
  }
  return { lines, insertAt: end, rows }
}

function checkName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || NAME_BAD.test(trimmed) || trimmed === '.' || trimmed === '..' || trimmed.includes('..')) {
    throw new AppError('PROJECT_NAME_INVALID', '项目名不能包含 / \\ | [ ] #')
  }
  return trimmed
}

function checkPath(repoPath: string): string {
  const trimmed = repoPath.trim()
  if (!trimmed) throw new AppError('PROJECT_PATH_INVALID', '请填写目录')
  if (trimmed.includes('`')) throw new AppError('PROJECT_PATH_INVALID', '路径不能包含反引号')
  return trimmed
}

function renderRow(req: ProjectWriteRequest, name: string, repoPath: string): string {
  const note = req.note.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim()
  return `| [[项目/${name}/主页]] | \`${repoPath}\` | ${writtenType(req.type, req.typeLabel)} | ${note} |`
}

function finish(markdown: string, lines: string[], today: string): string {
  return touchUpdated(lines.join(newline(markdown)), today)
}

export function addRow(markdown: string, req: ProjectWriteRequest, today: string): string {
  const name = checkName(req.name)
  const repoPath = checkPath(req.repoPath)
  const table = readTable(markdown)
  const id = normalizeRepoPath(repoPath)
  const samePath = table.rows.find((r) => r.id === id)
  if (samePath) throw new AppError('PROJECT_EXISTS', `这个目录已经登记为「${samePath.name}」`)
  if (table.rows.some((r) => r.name === name)) throw new AppError('PROJECT_NAME_TAKEN', '已有同名项目')
  table.lines.splice(table.insertAt, 0, renderRow(req, name, repoPath))
  return finish(markdown, table.lines, today)
}

export function updateRow(markdown: string, id: string, req: ProjectWriteRequest, today: string): string {
  const name = checkName(req.name)
  const repoPath = checkPath(req.repoPath)
  const table = readTable(markdown)
  const current = table.rows.find((r) => r.id === id)
  if (!current) throw new AppError('PROJECT_NOT_FOUND', `未找到项目：${id}`)
  const nextId = normalizeRepoPath(repoPath)
  const samePath = table.rows.find((r) => r.id === nextId && r.id !== id)
  if (samePath) throw new AppError('PROJECT_EXISTS', `这个目录已经登记为「${samePath.name}」`)
  if (table.rows.some((r) => r.name === name && r.id !== id)) throw new AppError('PROJECT_NAME_TAKEN', '已有同名项目')
  table.lines[current.index] = renderRow(req, name, repoPath)
  return finish(markdown, table.lines, today)
}

export function removeRow(markdown: string, id: string, today: string): string {
  const table = readTable(markdown)
  const hits = table.rows.filter((r) => r.id === id)
  if (hits.length === 0) throw new AppError('PROJECT_NOT_FOUND', `未找到项目：${id}`)
  const drop = new Set(hits.map((r) => r.index))
  return finish(markdown, table.lines.filter((_, i) => !drop.has(i)), today)
}
