import { cleanOutput } from '../report/writer'

export function buildCommitPrompt(input: {
  files: { code: string; path: string }[]
  diff: string
  recentSubjects?: string[]
}): string {
  const fileLines = input.files.map((f) => `${f.code.trim() || 'M'} ${f.path}`).join('\n')
  const recent =
    input.recentSubjects && input.recentSubjects.length > 0
      ? `\n## 仓库近期提交风格参考\n${input.recentSubjects.map((s) => `- ${s}`).join('\n')}\n`
      : ''

  return `你是一个资深前端工程师。请根据下面勾选文件的 Git 改动内容，生成一条简洁、准确的中文 Git 提交信息（Conventional Commits 格式）。

## 要求
1. 格式：\`<type>: <简明中文摘要>\`，其中 type 取 \`feat\`、\`fix\`、\`refactor\`、\`perf\`、\`style\`、\`test\`、\`chore\`、\`docs\` 之一。
2. 第一行控制在 50 字以内，直接说清楚「做了什么 / 修复了什么」，不要末尾句号。
3. 如果改动涉及多个独立点，可以在空一行后加 2~4 条简短的 \`- \` 要点；如果只是单一改动，只输出第一行即可。
4. **只输出提交信息正文**，不要输出任何解释、引号或 \`\`\` 代码块包裹。
${recent}
## 本次勾选的文件（${input.files.length} 个）
${fileLines}

## Diff 摘要
${input.diff || '（无文本差异）'}
`
}

export function cleanCommitMessage(raw: string): string {
  let text = cleanOutput(raw)
  const fence = /^```[a-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text)
  if (fence) text = fence[1].trim()
  // 去掉首尾引号或前缀说明
  text = text.replace(/^(?:commit\s*message|提交信息)\s*[:：]\s*/i, '').trim()
  if ((text.startsWith('"') && text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text
}
