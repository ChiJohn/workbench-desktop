import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { reportPath } from '../../shared/reportPeriod'
import type { ReportKind, ReportRange } from '../../shared/types'
import { readSection, replaceSection } from '../markdown/sections'

export const DAILY_SECTION = '日报'

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

/** 已有报告；日报只取「## 日报」小节 */
export async function readReport(vaultPath: string, kind: ReportKind, range: ReportRange, name?: string): Promise<{ path: string; content: string } | null> {
  const path = reportPath(kind, range, name)
  const text = await readText(join(vaultPath, path))
  if (text === null) return null
  if (kind !== 'daily') return { path, content: text }
  const section = readSection(text, DAILY_SECTION)
  return section === null ? null : { path, content: section }
}

/** 日报小节里不能出现一级 / 二级标题，否则会截断小节 */
export function dailyBody(content: string): string {
  return content
    .trim()
    .replace(/^# .*(\r?\n)*/, '')
    .replace(new RegExp(`^## ${DAILY_SECTION}[ \\t]*(\\r?\\n)*`), '')
    .replace(/^#{1,2} /gm, '### ')
    .trim()
}

/** 保存报告，返回 vault 相对路径 */
export async function saveReport(vaultPath: string, kind: ReportKind, range: ReportRange, content: string, name?: string): Promise<string> {
  const path = reportPath(kind, range, name)
  const file = join(vaultPath, path)
  await mkdir(dirname(file), { recursive: true })
  if (kind !== 'daily') {
    await writeFile(file, `${content.trim()}\n`, 'utf8')
    return path
  }
  const existing = (await readText(file)) ?? `---\ndate: ${range.start}\ntype: daily\n---\n\n# ${range.start}\n`
  await writeFile(file, replaceSection(existing, DAILY_SECTION, dailyBody(content)), 'utf8')
  return path
}
