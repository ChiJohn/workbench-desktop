import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { REPORT_KIND_LABELS } from '../../shared/reportPeriod'
import type { ReportKind } from '../../shared/types'

export const DEFAULT_TEMPLATES: Record<ReportKind, string> = {
  daily: `<!-- 日报写在 Daily 笔记的「## 日报」小节里：不要写一级、二级标题，只用下面三个三级标题。每条一句话，说清做了什么、结果如何。 -->

### 今日完成

- **项目名**：完成的工作。

### 进行中

- **项目名**：进行中的工作和当前进度。<!-- 没有可省略本节 -->

### 明日计划

- 计划。<!-- 根据进行中的工作和素材推断，不确定就写「待定」 -->
`,
  weekly: `# 工作周报（开始日期～结束日期）

## 核心工作

<!-- 按项目一条，项目名加粗；合并同一项目的多条素材，用业务语言概括功能，不罗列提交标题。 -->

- **项目名**：本周完成的主要功能和改进。

## 突出成果

<!-- 2~3 条对业务有价值的结果；没有可省略本节。 -->

- 成果。

## 风险与建议

<!-- 基于本周改动指出需要回归验证或关注的点。 -->

- 建议。
`,
  monthly: `# YYYY年M月月度工作总结

## 一、核心工作简述

<!-- 一段话概括本月主要参与的项目和推进的事情。 -->

## 二、个人成长与团队赋能

<!-- 两段：能力上的提升；协作中为团队做的事。第一人称，具体、不空泛。 -->

## 三、工作感悟与公司建议

<!-- 一段感悟，再列 2 条建议。 -->

- 建议。
`
}

export const templatePath = (kind: ReportKind) => `Templates/汇报-${REPORT_KIND_LABELS[kind]}.md`

/** 读取 vault 模板，不存在时写入默认模板 */
export async function ensureTemplate(vaultPath: string, kind: ReportKind): Promise<string> {
  const file = join(vaultPath, templatePath(kind))
  try {
    return await readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, DEFAULT_TEMPLATES[kind], 'utf8')
  return DEFAULT_TEMPLATES[kind]
}
