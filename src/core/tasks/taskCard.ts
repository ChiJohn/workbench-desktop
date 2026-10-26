import { existsSync } from 'node:fs'
import { mkdir, open, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { TapdItem, TapdKind } from '../../shared/types'
import { appendToSection, setFrontmatter, writeSection } from '../markdown/sections'

export { appendToSection, setFrontmatter }

const TITLE_MAX = 60
const FRONTMATTER_BYTES = 4096
const TYPE_BY_KIND: Record<TapdKind, string> = { story: 'feature', bug: 'bug', task: 'task' }

const pad = (n: number) => String(n).padStart(2, '0')
const dateStamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
const dateTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const yamlString = (s: string) => `'${s.replace(/'/g, "''")}'`
const toPosix = (p: string) => p.split(sep).join('/')

/** `Projects/驴充充后台/主页` → `Projects/驴充充后台` */
export function projectFolder(obsidianLink: string): string {
  const parts = obsidianLink.split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Projects'
}

export function cardFileName(title: string, now: Date, suffix = ''): string {
  const safe = title
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^-+|-+$/g, '')
    .trim()
    .slice(0, TITLE_MAX)
  return `task-${dateStamp(now)}-${safe || '未命名'}${suffix}.md`
}

interface CardContent {
  title: string
  folderName: string
  repoPath: string
  type: string
  status: string
  source: string
  tapdId: string | null
  multicaId: string | null
  description: string
  log: string[]
  result: string
  now: Date
}

function renderContent(c: CardContent): string {
  const ts = dateTime(c.now)
  return `---
title: ${yamlString(c.title)}
project: ${c.folderName}
repo: ${c.repoPath}
type: ${c.type}
priority: P2
status: ${c.status}
source: ${c.source}
${c.tapdId ? `tapd_id: '${c.tapdId}'\n` : ''}${c.multicaId ? `multica_id: '${c.multicaId}'\n` : ''}created: ${ts}
updated: ${ts}
---

# ${c.title}

## 描述

${c.description}

## 概况

待填写。

## 方案

待填写。

## 验证清单

- [ ] 待补充

## 执行记录

${c.log.map((l) => `- ${l}`).join('\n')}

## 结果

${c.result}
`
}

export function renderCard(input: {
  item: TapdItem
  description: string
  folderName: string
  repoPath: string
  now: Date
}): string {
  const { item, now } = input
  return renderContent({
    title: item.title,
    folderName: input.folderName,
    repoPath: input.repoPath,
    type: TYPE_BY_KIND[item.kind],
    status: 'todo',
    source: item.url,
    tapdId: item.id,
    multicaId: null,
    description: input.description || '（TAPD 正文为空）',
    log: [`${dateTime(now)}：从 TAPD 生成。`],
    result: '待填写。',
    now
  })
}

const PLACEHOLDER = '待填写。'

/** 「结果」为占位文字时替换，否则追加一个以编号为标题的小节 */
export function setResult(md: string, text: string, label: string): string {
  return writeSection(md, '结果', (current) => (!current || current === PLACEHOLDER ? text : `${current}\n\n### ${label}\n\n${text}`))
}

export async function backfillCard(input: {
  vaultPath: string
  project: { obsidianLink: string; repoPath: string }
  issue: { identifier: string; title: string; url: string; assigneeName: string | null }
  description: string
  conclusion: string | null
  tapd: { id: string; kind: TapdKind } | null
  now?: Date
}): Promise<string> {
  const { vaultPath, project, issue, tapd, now = new Date() } = input
  const ts = dateTime(now)
  const doneLine = issue.assigneeName
    ? `${ts}：multica ${issue.identifier} 由「${issue.assigneeName}」完成，已验收。`
    : `${ts}：multica ${issue.identifier} 已完成，已验收。`
  const result = input.conclusion?.trim() || '智能体没有留下结论。'
  const existing = (await findCardBy(vaultPath, 'multica_id', issue.identifier)) ?? (tapd ? await findCard(vaultPath, tapd.id) : null)
  if (existing) {
    const file = join(vaultPath, ...existing.split('/'))
    let md = await readFile(file, 'utf8')
    md = setFrontmatter(md, 'status', 'done')
    md = setFrontmatter(md, 'updated', ts)
    md = setFrontmatter(md, 'multica_id', `'${issue.identifier}'`)
    md = appendToSection(md, '执行记录', `- ${doneLine}`)
    md = setResult(md, result, issue.identifier)
    await writeFile(file, md, 'utf8')
    return existing
  }
  const folder = projectFolder(project.obsidianLink)
  return writeNewCard(vaultPath, folder, issue.title, now, (folderName) =>
    renderContent({
      title: issue.title,
      folderName,
      repoPath: project.repoPath,
      type: tapd ? TYPE_BY_KIND[tapd.kind] : 'feature',
      status: 'done',
      source: issue.url,
      tapdId: tapd?.id ?? null,
      multicaId: issue.identifier,
      description: input.description.trim() || '（multica 描述为空）',
      log: [`${ts}：从 multica ${issue.identifier} 生成。`, doneLine],
      result,
      now
    })
  )
}

async function writeNewCard(vaultPath: string, folder: string, title: string, now: Date, render: (folderName: string) => string): Promise<string> {
  const dir = join(vaultPath, ...folder.split('/'))
  await mkdir(dir, { recursive: true })
  let name = cardFileName(title, now)
  for (let n = 2; existsSync(join(dir, name)); n++) name = cardFileName(title, now, `-${n}`)
  await writeFile(join(dir, name), render(folder.split('/').pop() ?? folder), { encoding: 'utf8', flag: 'wx' })
  return `${folder}/${name}`
}

async function readHead(file: string): Promise<string> {
  const handle = await open(file, 'r')
  try {
    const buf = Buffer.alloc(FRONTMATTER_BYTES)
    const { bytesRead } = await handle.read(buf, 0, FRONTMATTER_BYTES, 0)
    return buf.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

/** 递归列出 `task-*.md`（跳过隐藏目录） */
export async function* taskFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory() && !e.name.startsWith('.')) yield* taskFiles(full)
    else if (e.isFile() && e.name.startsWith('task-') && e.name.endsWith('.md')) yield full
  }
}

/** 返回 vault 相对路径（/ 分隔） */
export async function findCard(vaultPath: string, tapdId: string): Promise<string | null> {
  return findCardBy(vaultPath, 'tapd_id', tapdId)
}

export async function findCardBy(vaultPath: string, field: string, value: string): Promise<string | null> {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${field}:\\s*['"]?${escaped}['"]?\\s*$`, 'm')
  for await (const file of taskFiles(join(vaultPath, 'Projects'))) {
    if (pattern.test(await readHead(file))) return toPosix(relative(vaultPath, file))
  }
  return null
}

export async function createCard(input: {
  vaultPath: string
  project: { obsidianLink: string; repoPath: string }
  item: TapdItem
  description: string
  now?: Date
}): Promise<string> {
  const { vaultPath, project, item, description, now = new Date() } = input
  const existing = await findCard(vaultPath, item.id)
  if (existing) return existing

  return writeNewCard(vaultPath, projectFolder(project.obsidianLink), item.title, now, (folderName) =>
    renderCard({ item, description, folderName, repoPath: project.repoPath, now })
  )
}
