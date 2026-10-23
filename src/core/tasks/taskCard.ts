import { existsSync } from 'node:fs'
import { mkdir, open, readdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { TapdItem, TapdKind } from '../../shared/types'

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

export function renderCard(input: {
  item: TapdItem
  description: string
  folderName: string
  repoPath: string
  now: Date
}): string {
  const { item, description, folderName, repoPath, now } = input
  const ts = dateTime(now)
  return `---
title: ${yamlString(item.title)}
project: ${folderName}
repo: ${repoPath}
type: ${TYPE_BY_KIND[item.kind]}
priority: P2
status: todo
source: ${item.url}
tapd_id: '${item.id}'
created: ${ts}
updated: ${ts}
---

# ${item.title}

## 描述

${description || '（TAPD 正文为空）'}

## 概况

待填写。

## 方案

待填写。

## 验证清单

- [ ] 待补充

## 执行记录

- ${ts}：从 TAPD 生成。

## 结果

待填写。
`
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

async function* taskFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory() && !e.name.startsWith('.')) yield* taskFiles(full)
    else if (e.isFile() && e.name.startsWith('task-') && e.name.endsWith('.md')) yield full
  }
}

/** 返回 vault 相对路径（/ 分隔） */
export async function findCard(vaultPath: string, tapdId: string): Promise<string | null> {
  const pattern = new RegExp(`^tapd_id:\\s*['"]?${tapdId}['"]?\\s*$`, 'm')
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

  const folder = projectFolder(project.obsidianLink)
  const dir = join(vaultPath, ...folder.split('/'))
  await mkdir(dir, { recursive: true })
  let name = cardFileName(item.title, now)
  for (let n = 2; existsSync(join(dir, name)); n++) name = cardFileName(item.title, now, `-${n}`)
  const content = renderCard({ item, description, folderName: folder.split('/').pop() ?? folder, repoPath: project.repoPath, now })
  await writeFile(join(dir, name), content, { encoding: 'utf8', flag: 'wx' })
  return `${folder}/${name}`
}
