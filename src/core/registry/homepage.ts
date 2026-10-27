import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export function renderHomepage(
  project: { name: string; repoPath: string; typeText: string; note: string },
  today: string
): string {
  const note = project.note.trim() ? `- 说明：${project.note.trim()}\n` : ''
  return `---
type: project
created: ${today}
updated: ${today}
---

# ${project.name}

- 仓库：\`${project.repoPath}\`
- 类型：${project.typeText}
${note}`
}

/** 主页已存在时不覆盖，返回是否新建 */
export async function ensureHomepage(vault: string, name: string, content: string): Promise<boolean> {
  const file = join(vault, '项目', name, '主页.md')
  await mkdir(dirname(file), { recursive: true })
  try {
    await writeFile(file, content, { encoding: 'utf8', flag: 'wx' })
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw e
  }
}
