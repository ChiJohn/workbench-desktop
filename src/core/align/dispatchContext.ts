const LIMIT = 20_000

const FIGMA_NOTE =
  '用 Figma MCP 读取以上节点（get_design_context / get_screenshot），按设计稿对齐布局、颜色、字号、间距；优先复用项目里已有的组件和样式变量。若无法访问 Figma MCP，请在回复里说明。'

const API_NOTE =
  '按以上契约对接，沿用项目现有的请求封装和类型目录；契约里标为未提供的字段先留 TODO，不要猜。如果你能用 Apifox MCP，可以用它查相关接口；以本契约为准。'

export interface DispatchDesign {
  name: string
  url: string
}

export interface DispatchContract {
  title: string
  /** vault 相对路径，含 .md */
  path: string
  body: string
}

function stripExamples(contract: DispatchContract): DispatchContract {
  const body = contract.body.replace(/## 示例\r?\n\r?\n[\s\S]*?(?=\r?\n## |\s*$)/, `## 示例\n\n示例已省略，完整内容见 vault 的 \`${contract.path}\`\n\n`)
  return { ...contract, body }
}

function alignText(designs: DispatchDesign[], contracts: DispatchContract[]): string {
  const parts: string[] = []
  if (designs.length) {
    parts.push(`## 设计稿\n\n${designs.map((d) => `- [${d.name}](${d.url})`).join('\n')}\n\n${FIGMA_NOTE}`)
  }
  if (contracts.length) {
    parts.push(`## 接口\n\n${contracts.map((c) => `### ${c.title}\n\n${c.body.trim()}`).join('\n\n')}\n\n${API_NOTE}`)
  }
  return parts.join('\n\n')
}

/** 整段超过约 2 万字时去掉示例，并注明完整内容在 vault */
export function renderAlignForDispatch(designs: DispatchDesign[], contracts: DispatchContract[]): string {
  let text = alignText(designs, contracts)
  if (text.length <= LIMIT) return text
  text = alignText(designs, contracts.map(stripExamples))
  if (text.length <= LIMIT) return text
  return `${text.slice(0, LIMIT)}\n\n（上下文过长，已截断。完整契约见 vault。）\n`
}
