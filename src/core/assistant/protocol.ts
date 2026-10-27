import type { AssistantClientAction, AssistantContext, AssistantMode, ReportKind } from '../../shared/types'

export const MAX_TOOL_ROUNDS = 4

const READ = ['projects', 'repoStatus', 'tapdSummary', 'multicaSummary', 'knowledgeSearch', 'selection'] as const
const WRITE = ['openProject', 'gitFetch', 'gitPull', 'runScript', 'openDispatch', 'openReport', 'openNewProject'] as const

export type ReadTool = (typeof READ)[number]
export type WriteTool = (typeof WRITE)[number]

const OPENERS = ['cursor', 'terminal', 'explorer'] as const
const OPENER_LABELS: Record<(typeof OPENERS)[number], string> = { cursor: 'Cursor IDE', terminal: '终端', explorer: '资源管理器' }
const REPORT_KINDS: ReportKind[] = ['daily', 'weekly', 'monthly']
const REPORT_LABELS: Record<ReportKind, string> = { daily: '日报', weekly: '周报', monthly: '月报' }

interface Spec {
  label: string
  kind: 'read' | 'write'
  hint: string
}

const SPECS: Record<ReadTool | WriteTool, Spec> = {
  projects: { label: '项目列表', kind: 'read', hint: '列出已登记项目的名称、类型、是否可用。无参数' },
  repoStatus: { label: '仓库状态', kind: 'read', hint: '参数 {"project":"项目名或 id"}。返回分支、改动数、领先/落后、最近提交' },
  tapdSummary: { label: 'TAPD 摘要', kind: 'read', hint: '未完成单按状态计数。无参数，不含令牌' },
  multicaSummary: { label: '智能体摘要', kind: 'read', hint: '当前工作区未完成任务计数，并列出待审查标题。无参数，不含令牌' },
  knowledgeSearch: { label: '知识搜索', kind: 'read', hint: '参数 {"query":"关键词","project":"可选项目名"}' },
  selection: { label: '当前选中', kind: 'read', hint: '当前页面、选中的项目和单子。无参数' },
  openProject: { label: '打开项目', kind: 'write', hint: '参数 {"project":"项目名","opener":"cursor|terminal|explorer"}' },
  gitFetch: { label: 'git fetch', kind: 'write', hint: '参数 {"project":"项目名"}。只拉取远程引用，不改分支' },
  gitPull: { label: 'git pull', kind: 'write', hint: '参数 {"project":"项目名"}' },
  runScript: { label: '运行脚本', kind: 'write', hint: '参数 {"project":"项目名","script":"package.json 里的脚本名"}' },
  openDispatch: { label: '打开派单', kind: 'write', hint: '参数 {"tapdKey":"story:123","title":"可选标题"}。只打开窗口，用户自己提交' },
  openReport: { label: '打开汇报', kind: 'write', hint: '参数 {"kind":"daily|weekly|monthly","notes":"可选补充说明"}。只打开页面' },
  openNewProject: { label: '新增项目', kind: 'write', hint: '参数 {"name":"可选","repoPath":"可选路径"}。只打开窗口，用户自己保存' }
}

const isTool = (name: string): name is ReadTool | WriteTool => name in SPECS

export function toolCatalog(mode: AssistantMode): string {
  return Object.entries(SPECS)
    .filter(([, spec]) => mode === 'act' || spec.kind === 'read')
    .map(([name, spec]) => `- ${name}（${spec.label}）：${spec.hint}`)
    .join('\n')
}

export function assistantPrompt(input: { mode: AssistantMode; history: { role: 'user' | 'assistant' | 'tool'; text: string }[]; context: AssistantContext }): string {
  const modeLine =
    input.mode === 'ask'
      ? '当前是问答模式。只能使用只读工具。用户若要求打开项目、拉代码、运行脚本或打开弹窗，用中文告诉他切换到操作模式，不要输出那些工具。'
      : '当前是操作模式。会改动工作台的工具可以输出，工作台会先让用户确认，确认前不会执行。'
  const history = input.history.map((item) => (item.role === 'user' ? `用户：${item.text}` : item.role === 'tool' ? `工具结果：${item.text}` : `助手：${item.text}`)).join('\n\n')
  return [
    '你是工作台里的助手。用中文回答。不要编造仓库状态、单号或文件内容。',
    '需要数据时只输出一行工具调用，不要在这行前后加解释：',
    'TOOL 名称 {"参数":"值"}',
    '没有合适的工具就直接回答，不要输出 TOOL。',
    modeLine,
    '',
    '工具：',
    toolCatalog(input.mode),
    '',
    '当前界面：',
    formatContext(input.context),
    '',
    '对话：',
    history || '（空）',
    '',
    '请继续。'
  ].join('\n')
}

export function formatContext(ctx: AssistantContext): string {
  const lines = [`页面：${ctx.view}`]
  if (ctx.projectName || ctx.projectId) lines.push(`项目：${ctx.projectName ?? ctx.projectId}`)
  if (ctx.taskKey) lines.push(`TAPD：${ctx.taskKey}`)
  if (ctx.issueId) lines.push(`智能体任务：${ctx.issueId}`)
  return lines.join('\n')
}

export interface ParsedCall {
  name: string
  args: Record<string, unknown>
}

/** 没有合法的 TOOL 行时返回 null，整段当作普通回答 */
export function parseToolCall(text: string): ParsedCall | null {
  for (const line of text.split(/\r?\n/)) {
    const matched = /^TOOL\s+([A-Za-z][A-Za-z0-9]*)\s*(.*)$/.exec(line.trim())
    if (!matched) continue
    const rest = matched[2].trim()
    if (!rest) return { name: matched[1], args: {} }
    try {
      const args = JSON.parse(rest) as unknown
      if (!args || typeof args !== 'object' || Array.isArray(args)) return null
      return { name: matched[1], args: args as Record<string, unknown> }
    } catch {
      return null
    }
  }
  return null
}

export type PreparedCall =
  | { ok: true; kind: 'read' | 'write'; name: ReadTool | WriteTool; args: Record<string, string>; label: string; summary: string }
  | { ok: false; message: string; stop: boolean }

export function prepareCall(name: string, raw: Record<string, unknown>, mode: AssistantMode): PreparedCall {
  if (!isTool(name)) {
    return { ok: false, stop: true, message: `没有「${name}」这个工具。可用的是：${Object.keys(SPECS).filter((key) => mode === 'act' || SPECS[key as ReadTool].kind === 'read').join('、')}。` }
  }
  const spec = SPECS[name]
  if (spec.kind === 'write' && mode === 'ask') {
    return { ok: false, stop: true, message: `「${spec.label}」会改动工作台，问答模式不会执行。切换到操作模式后再试。` }
  }
  const args: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') args[key] = value.trim()
    else if (typeof value === 'number' || typeof value === 'boolean') args[key] = String(value)
  }
  const missing = (key: string) => !args[key]
  const fail = (message: string): PreparedCall => ({ ok: false, stop: false, message })
  if ((name === 'repoStatus' || name === 'openProject' || name === 'gitFetch' || name === 'gitPull' || name === 'runScript') && missing('project')) {
    return fail('参数 project 不能为空。')
  }
  if (name === 'knowledgeSearch' && missing('query')) return fail('参数 query 不能为空。')
  if (name === 'runScript' && missing('script')) return fail('参数 script 不能为空。')
  if (name === 'openProject' && !OPENERS.includes(args.opener as (typeof OPENERS)[number])) {
    return fail('参数 opener 只能是 cursor、terminal 或 explorer。')
  }
  if (name === 'openDispatch') {
    if (!/^(story|bug|task):\d+$/.test(args.tapdKey ?? '')) return fail('参数 tapdKey 需要是 story:数字、bug:数字 或 task:数字。')
  }
  if (name === 'openReport' && args.kind && !REPORT_KINDS.includes(args.kind as ReportKind)) {
    return fail('参数 kind 只能是 daily、weekly 或 monthly。')
  }
  return { ok: true, kind: spec.kind, name, args, label: spec.label, summary: summarize(name, args) }
}

export function summarize(name: ReadTool | WriteTool, args: Record<string, string>): string {
  const project = args.project || '项目'
  switch (name) {
    case 'openProject':
      return `用${OPENER_LABELS[args.opener as (typeof OPENERS)[number]] ?? args.opener}打开「${project}」`
    case 'gitFetch':
      return `对「${project}」执行 git fetch`
    case 'gitPull':
      return `对「${project}」执行 git pull`
    case 'runScript':
      return `在「${project}」运行脚本 ${args.script}`
    case 'openDispatch':
      return `打开派单窗口（${args.tapdKey}${args.title ? `，标题「${args.title}」` : ''}）`
    case 'openReport':
      return `打开${REPORT_LABELS[(args.kind as ReportKind) || 'weekly']}${args.notes ? `，补充说明：${args.notes}` : ''}`
    case 'openNewProject':
      return `打开新增项目${args.name ? `「${args.name}」` : ''}${args.repoPath ? `，路径 ${args.repoPath}` : ''}`
    default:
      return SPECS[name].label
  }
}

export function clientActionFor(name: WriteTool, args: Record<string, string>): AssistantClientAction | null {
  if (name === 'openDispatch') return { type: 'dispatch', tapdKey: args.tapdKey, ...(args.title && { title: args.title }) }
  if (name === 'openReport') return { type: 'report', kind: (args.kind as ReportKind) || 'weekly', ...(args.notes && { notes: args.notes }) }
  if (name === 'openNewProject') return { type: 'newProject', ...(args.name && { name: args.name }), ...(args.repoPath && { repoPath: args.repoPath }) }
  return null
}
