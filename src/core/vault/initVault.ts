import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { ReportKind, VaultInitResult } from '../../shared/types'
import { KNOWLEDGE_DIR, QA_DIR } from '../knowledge/notes'
import { AppError } from '../result'
import { DEFAULT_TEMPLATES, templatePath } from '../report/templates'
import { TASKS_DIR } from '../tasks/taskCard'

const HOME = `# 工作台

这个库给工作台用。工作台会读取和写入下面这些位置。

| 路径 | 内容 |
| --- | --- |
| \`项目.md\` | 项目和本机仓库的对应关系。工作台从这里读取项目列表 |
| \`项目/<名称>/主页.md\` | 项目主页，参考文档、接口说明放在同一目录 |
| \`任务/\` | 任务卡，从 TAPD 或 multica 生成 |
| \`汇报/日报/\`、\`汇报/周报/\`、\`汇报/月报/\` | 汇报正文 |
| \`汇报/模板/\` | 日报、周报、月报模板，可以直接改 |
| \`知识/\` | 可复用的经验，一篇一个文件 |
| \`问答/\` | 存下来的问答 |
| \`附件/\` | 图片等附件 |

先在 \`项目.md\` 的表格里登记项目，再回到工作台刷新。
`

const PROJECT_MAP = `---
type: repo-map
---

# 项目

工作台只读取「已确认映射」表格。每行一个项目：第一列写项目主页链接，第二列用反引号写本机仓库路径。

类型可以写：小程序应用、H5 应用、后台前端仓库、PC 前端仓库、CLI 仓库，其他写法会归到「其他」。

## 已确认映射

| 项目 | 代码仓库 / 入口目录 | 类型 | 说明 |
| --- | --- | --- | --- |

<!-- 示例：| [[项目/示例项目/主页]] | \`D:\\code\\example\` | 后台前端仓库 | 说明 | -->
`

const DIRS = ['项目', TASKS_DIR, KNOWLEDGE_DIR, QA_DIR, '附件', '汇报/日报', '汇报/周报', '汇报/月报', '汇报/模板']

export async function initVault(vaultPath: string): Promise<VaultInitResult> {
  const root = vaultPath.trim()
  if (!root || !isAbsolute(root)) throw new AppError('VAULT_PATH', '请填写 vault 的完整路径')
  const created: string[] = []
  const skipped: string[] = []
  await mkdir(root, { recursive: true })

  for (const dir of DIRS) {
    const full = join(root, ...dir.split('/'))
    if (existsSync(full)) skipped.push(`${dir}/`)
    else {
      await mkdir(full, { recursive: true })
      created.push(`${dir}/`)
    }
  }

  const files: [string, string][] = [
    ['主页.md', HOME],
    ['项目.md', PROJECT_MAP],
    ...(Object.keys(DEFAULT_TEMPLATES) as ReportKind[]).map((kind): [string, string] => [templatePath(kind), DEFAULT_TEMPLATES[kind]])
  ]
  for (const [rel, content] of files) {
    const full = join(root, ...rel.split('/'))
    if (existsSync(full)) {
      skipped.push(rel)
      continue
    }
    await writeFile(full, content, { encoding: 'utf8', flag: 'wx' })
    created.push(rel)
  }
  return { path: root, created, skipped }
}
