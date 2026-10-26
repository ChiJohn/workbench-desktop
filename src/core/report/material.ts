import { REPORT_KIND_LABELS, REPORT_SOURCE_LABELS as SOURCE_LABELS } from '../../shared/reportPeriod'
import type { ReportEntry, ReportKind, ReportRange, ReportSource } from '../../shared/types'

const SOURCE_ORDER: ReportSource[] = ['git', 'tapd', 'multica', 'cards']

/** 来源 → 项目分组的 Markdown，组内按时间正序 */
export function renderMaterial(entries: ReportEntry[], notes: string): string {
  const blocks: string[] = []
  for (const source of SOURCE_ORDER) {
    const groups = new Map<string, ReportEntry[]>()
    for (const e of entries.filter((x) => x.source === source)) groups.set(e.group, [...(groups.get(e.group) ?? []), e])
    if (!groups.size) continue
    const lines = [`## ${SOURCE_LABELS[source]}`, '']
    for (const [group, items] of groups) {
      lines.push(`### ${group}`, '')
      for (const e of [...items].sort((a, b) => a.time.localeCompare(b.time))) {
        lines.push(`- ${e.time} ${e.title}`, ...(e.detail ? e.detail.split('\n').map((l) => `  ${l}`) : []))
      }
      lines.push('')
    }
    blocks.push(lines.join('\n'))
  }
  if (notes.trim()) blocks.push(`## 手动补充\n\n${notes.trim()}\n`)
  return blocks.length ? blocks.join('\n') : '（无素材）\n'
}

export function buildPrompt(kind: ReportKind, range: ReportRange, template: string, material: string): string {
  return [
    `你在帮我写${REPORT_KIND_LABELS[kind]}，时间段 ${range.start} ~ ${range.end}。`,
    '严格按「模板」的结构和写作要求，只根据「素材」写，不要编造素材里没有的工作。模板里 <!-- --> 中的是写作要求，不要输出。',
    '只输出报告正文（Markdown），不要解释，不要代码块包裹。',
    '',
    '===== 模板 =====',
    '',
    template.trimEnd(),
    '',
    '===== 素材 =====',
    '',
    material
  ].join('\n')
}
