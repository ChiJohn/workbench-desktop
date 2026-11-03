import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ReportWriter, TapdItem } from '../../shared/types'
import { renderAlignForDispatch, type DispatchContract, type DispatchDesign } from '../align/dispatchContext'
import { appendToSection, setFrontmatter, writeSection } from '../markdown/sections'
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
  now?: Date
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
  if (alignBlock) contextParts.push(alignBlock.trim())
  if (input.uaContext?.trim()) contextParts.push(input.uaContext.trim())

  if (contextParts.length > 0) {
    md = writeSection(md, '派单上下文', () => contextParts.join('\n\n'))
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
  const prompt = `请先读取 Obsidian 任务卡 ${normFile} 了解完整需求描述、接口契约与代码图谱线索，在此仓库完成代码实现与验证（不要直接 git push），完成后将改动摘要更新到该任务卡的「## 执行记录」与「## 结果」小节：${cleanTitle}`
  const bin = opts.writer === 'codex' ? 'codex' : opts.writer === 'cursor' ? 'cursor-agent' : 'claude'
  return `${bin} "${prompt}"`
}
