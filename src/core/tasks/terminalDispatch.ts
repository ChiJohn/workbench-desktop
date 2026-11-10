import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ReportWriter, TapdItem } from '../../shared/types'
import { renderAlignForDispatch, type DispatchContract, type DispatchDesign } from '../align/dispatchContext'
import type { SearchGroup } from '../knowledge/search'
import { appendToSection, readSection, setFrontmatter, writeSection } from '../markdown/sections'
import { WRITER_LABELS } from '../report/writer'
import { cardFileName, createCard, findCard, projectLabel, TASKS_DIR } from './taskCard'

const pad = (n: number) => String(n).padStart(2, '0')
const dateTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const yamlString = (s: string) => `'${s.replace(/'/g, "''")}'`

export interface UpsertVaultTaskCardInput {
  vaultPath: string
  project: { name: string; obsidianLink: string; repoPath: string }
  writer: ReportWriter
  title: string
  description: string
  tapdItem?: TapdItem
  designs?: DispatchDesign[]
  contracts?: DispatchContract[]
  uaContext?: string | null
  knowledgeContext?: string | null
  now?: Date
}

const KNOWLEDGE_NOTES = 3
const KNOWLEDGE_EXCERPT = 200
const KNOWLEDGE_LIMIT = 3000

/** 标题加描述压成一句，避免把整篇 TAPD 正文塞进 Obsidian 搜索参数 */
export function knowledgeDispatchQuery(title: string, description: string): string {
  return `${title}\n${description}`.replace(/\s+/g, ' ').trim().slice(0, KNOWLEDGE_EXCERPT)
}

const KNOWLEDGE_TRUNCATED = '\n\n（知识摘录过长，已截断。）\n'

/** 前 3 篇笔记的路径和摘录。没有命中时返回 null */
export function renderKnowledgeDispatchContext(groups: SearchGroup[]): string | null {
  const notes = groups
    .filter((group) => group.file.trim() && group.snippets.some((snippet) => snippet.trim()))
    .slice(0, KNOWLEDGE_NOTES)
  if (!notes.length) return null
  const blocks = notes.map((group) => {
    const excerpt = group.snippets
      .map((snippet) => snippet.trim())
      .find(Boolean)!
      .replace(/\s+/g, ' ')
      .slice(0, KNOWLEDGE_EXCERPT)
    return `- \`${group.file.trim()}\`\n  ${excerpt}`
  })
  let text = `## 知识库\n\n以下为按任务描述从 vault 检索到的笔记摘录，全文在对应路径。\n\n${blocks.join('\n\n')}`
  if (text.length > KNOWLEDGE_LIMIT) {
    text = `${text.slice(0, Math.max(0, KNOWLEDGE_LIMIT - KNOWLEDGE_TRUNCATED.length))}${KNOWLEDGE_TRUNCATED}`
  }
  return text
}

/** 放进「派单上下文」时降为三级标题，避免被当成下一节而没法整节刷新 */
function nestHeadings(block: string): string {
  return block.replace(/^## /gm, '### ')
}

const STABLE_SECTIONS = new Set(['描述', '概况', '方案', '验证清单', '约定', '执行记录', '结果'])

/** 整段换掉「派单上下文」，并吃掉紧随其后的设计稿、接口、知识库等旧标题，不动「结果」和「约定」 */
function replaceDispatchContext(md: string, body: string): string {
  const headings: { index: number; title: string }[] = []
  const re = /^## ([^\r\n]+?)[ \t]*\r?$/gm
  let match: RegExpExecArray | null
  while ((match = re.exec(md))) headings.push({ index: match.index, title: match[1].trim() })
  const startAt = headings.findIndex((heading) => heading.title === '派单上下文')
  if (startAt < 0) return writeSection(md, '派单上下文', () => body)
  let end = md.length
  for (let i = startAt + 1; i < headings.length; i++) {
    if (STABLE_SECTIONS.has(headings[i].title)) {
      end = headings[i].index
      break
    }
  }
  const before = md.slice(0, headings[startAt].index).replace(/\s*$/, '')
  const after = md.slice(end).replace(/^\s*/, '')
  const block = `## 派单上下文\n\n${body.trim()}\n`
  return after ? `${before}\n\n${block}\n${after}` : `${before}\n\n${block}`
}

/**
 * 在 Obsidian Vault 的 `任务/` 目录下创建或更新任务卡（`任务/task-YYYYMMDD-标题.md`），
 * 将描述、设计稿/接口契约、UA 代码图谱线索与派单记录写入该任务卡，返回 Vault 相对路径与完整路径。
 */
export async function upsertVaultTerminalTaskCard(
  input: UpsertVaultTaskCardInput
): Promise<{ cardRel: string; cardFullPath: string }> {
  const { vaultPath, project, writer, title, description, tapdItem, now = new Date() } = input
  const ts = dateTime(now)
  const writerLabel = WRITER_LABELS[writer] ?? writer
  const folderName = projectLabel(project.obsidianLink) || project.name

  let cardRel: string | null = null
  if (tapdItem) {
    cardRel = await findCard(vaultPath, tapdItem.id)
    if (!cardRel) {
      cardRel = await createCard({
        vaultPath,
        project,
        item: { ...tapdItem, title: title.trim() || tapdItem.title },
        description: description.trim() || '（TAPD 正文为空）',
        now
      })
    }
  } else {
    const dir = join(vaultPath, TASKS_DIR)
    await mkdir(dir, { recursive: true })
    let name = cardFileName(title, now)
    for (let n = 2; existsSync(join(dir, name)); n++) {
      name = cardFileName(title, now, `-${n}`)
    }
    cardRel = `${TASKS_DIR}/${name}`
    const initialMd = `---
title: ${yamlString(title.trim())}
project: ${folderName}
repo: ${project.repoPath}
type: task
priority: P2
status: doing
source: workbench-todo
created: ${ts}
updated: ${ts}
---

# ${title.trim()}

## 描述

${description.trim() || '（无详细描述）'}

## 概况

待填写。

## 方案

待填写。

## 验证清单

- [ ] 待补充

## 约定

待填写。

## 执行记录

- ${ts}：从工作台待办生成并派给终端 AI（${writerLabel}）。

## 结果

待填写。
`
    await writeFile(join(dir, name), initialMd, 'utf8')
  }

  const cardFullPath = resolve(vaultPath, ...cardRel.split('/'))
  let md = await readFile(cardFullPath, 'utf8')
  md = setFrontmatter(md, 'status', 'doing')
  md = setFrontmatter(md, 'updated', ts)
  if (description.trim()) {
    md = writeSection(md, '描述', () => description.trim())
  }

  const contextParts: string[] = []
  const alignBlock = renderAlignForDispatch(input.designs ?? [], input.contracts ?? [])
  if (alignBlock) contextParts.push(nestHeadings(alignBlock.trim()))
  if (input.uaContext?.trim()) contextParts.push(nestHeadings(input.uaContext.trim()))
  if (input.knowledgeContext?.trim()) contextParts.push(nestHeadings(input.knowledgeContext.trim()))

  if (contextParts.length > 0) {
    md = replaceDispatchContext(md, contextParts.join('\n\n'))
  }
  if (readSection(md, '约定') === null) {
    md = writeSection(md, '约定', () => '待填写。')
  }

  if (tapdItem) {
    md = appendToSection(md, '执行记录', `- ${ts}：派给终端 AI（${writerLabel}）处理。`)
  }

  await writeFile(cardFullPath, md, 'utf8')
  return { cardRel, cardFullPath }
}

export function buildTerminalAiLaunchLine(opts: {
  writer: ReportWriter
  cardFullPath: string
  title: string
}): string {
  const normFile = opts.cardFullPath.replace(/\\/g, '/')
  const cleanTitle = opts.title.replace(/[\r\n"]+/g, ' ').trim()
  const prompt = `请先读取 Obsidian 任务卡 ${normFile}。先看「结果」「约定」和「派单上下文」（含知识库摘录），不要依赖你自己上次的会话。在此仓库完成代码实现与验证（不要直接 git push）。完成后把改动摘要追加到「## 执行记录」，把下次仍要遵守的规则补进「## 约定」并保留已有约定，把本次结论追加到「## 结果」：${cleanTitle}`
  const bin = opts.writer === 'codex' ? 'codex' : opts.writer === 'cursor' ? 'cursor-agent' : 'claude'
  return `${bin} "${prompt}"`
}
