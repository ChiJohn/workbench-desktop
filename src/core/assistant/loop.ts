import { AppError } from '../result'
import { cleanOutput } from '../report/writer'
import type { AssistantClientAction, AssistantContext, AssistantMessage, AssistantMode, AssistantPending, AssistantTurn } from '../../shared/types'
import { assistantPrompt, clientActionFor, MAX_TOOL_ROUNDS, prepareCall, parseToolCall, type ReadTool, type WriteTool } from './protocol'

export interface AssistantToolFns {
  read(name: ReadTool, args: Record<string, string>, context: AssistantContext): Promise<string>
  /** 校验写操作但不执行，用来生成确认卡文案 */
  previewWrite(name: WriteTool, args: Record<string, string>): Promise<{ summary: string } | { error: string }>
  executeWrite(name: WriteTool, args: Record<string, string>): Promise<{ text: string; clientAction?: AssistantClientAction }>
}

interface HistItem {
  role: 'user' | 'assistant' | 'tool'
  text: string
}

const RESULT_LIMIT = 3000

export class AssistantLoop {
  private hist: HistItem[] = []
  private visible: AssistantMessage[] = []
  private pending: AssistantPending | null = null
  private context: AssistantContext = { view: 'overview' }
  private mode: AssistantMode = 'ask'
  private busy = false
  private cancelled = false
  private run: ((prompt: string) => Promise<string>) | null = null
  private clientAction: AssistantClientAction | null = null

  constructor(private readonly tools: AssistantToolFns) {}

  get running(): boolean {
    return this.busy
  }

  async send(text: string, context: AssistantContext, opts: { mode: AssistantMode; run(prompt: string): Promise<string> }): Promise<AssistantTurn> {
    const message = text.trim()
    if (!message) throw new AppError('ASSISTANT_EMPTY', '请输入内容')
    if (this.busy) throw new AppError('ASSISTANT_BUSY', '已有对话在进行')
    if (this.pending) throw new AppError('ASSISTANT_PENDING', '先确认或取消上一步操作')
    this.context = context
    this.mode = opts.mode
    this.run = opts.run
    this.clientAction = null
    this.cancelled = false
    this.busy = true
    this.visible.push({ role: 'user', text: message })
    this.hist.push({ role: 'user', text: message })
    try {
      await this.rounds()
      return this.snapshot()
    } catch (error) {
      if (this.cancelled || (error instanceof AppError && error.code === 'REPORT_CANCELLED')) {
        this.visible.push({ role: 'assistant', text: '已停止。' })
        return this.snapshot()
      }
      this.visible.pop()
      this.hist.pop()
      throw error
    } finally {
      this.busy = false
    }
  }

  async confirm(): Promise<AssistantTurn> {
    if (this.busy) throw new AppError('ASSISTANT_BUSY', '已有对话在进行')
    if (!this.pending || !this.run) throw new AppError('ASSISTANT_NOTHING', '没有待确认的操作')
    const pending = this.pending
    this.pending = null
    this.clientAction = null
    this.cancelled = false
    this.busy = true
    let executed = false
    try {
      const done = await this.tools.executeWrite(pending.name as WriteTool, pending.args)
      executed = true
      this.hist.push({ role: 'tool', text: clip(done.text) })
      this.clientAction = done.clientAction ?? clientActionFor(pending.name as WriteTool, pending.args)
      await this.rounds()
      return this.snapshot()
    } catch (error) {
      if (this.cancelled || (error instanceof AppError && error.code === 'REPORT_CANCELLED')) {
        this.visible.push({ role: 'assistant', text: '已停止。' })
        return this.snapshot()
      }
      const message = error instanceof Error ? error.message : String(error)
      this.visible.push({ role: 'assistant', text: executed ? `操作已经执行。后续回复失败：${message}` : message })
      return this.snapshot()
    } finally {
      this.busy = false
    }
  }

  /** 模型还在跑时只打标记，由进行中的 send/confirm 收尾；有确认卡时直接撤掉 */
  cancel(): AssistantTurn {
    if (this.busy) {
      this.cancelled = true
      return this.snapshot()
    }
    if (this.pending) {
      this.pending = null
      this.visible.push({ role: 'assistant', text: '已取消这次操作。' })
    }
    return this.snapshot()
  }

  private async rounds(): Promise<void> {
    if (!this.run) return
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      if (this.cancelled) throw new AppError('REPORT_CANCELLED', '已停止')
      const output = cleanOutput(await this.run(assistantPrompt({ mode: this.mode, history: this.hist, context: this.context })))
      const call = parseToolCall(output)
      if (!call) {
        this.visible.push({ role: 'assistant', text: output })
        this.hist.push({ role: 'assistant', text: output })
        return
      }
      const prepared = prepareCall(call.name, call.args, this.mode)
      this.hist.push({ role: 'assistant', text: output.trim() })
      if (!prepared.ok) {
        if (prepared.stop) {
          this.visible.push({ role: 'assistant', text: prepared.message })
          this.hist.push({ role: 'tool', text: prepared.message })
          return
        }
        this.hist.push({ role: 'tool', text: prepared.message })
        continue
      }
      if (prepared.kind === 'write') {
        const preview = await this.tools.previewWrite(prepared.name as WriteTool, prepared.args)
        if ('error' in preview) {
          this.hist.push({ role: 'tool', text: preview.error })
          continue
        }
        this.pending = { name: prepared.name, label: prepared.label, args: prepared.args, summary: preview.summary }
        return
      }
      const result = await this.tools.read(prepared.name as ReadTool, prepared.args, this.context)
      this.hist.push({ role: 'tool', text: clip(result) })
    }
    this.visible.push({ role: 'assistant', text: '这轮工具调用已达上限，请换个问法。' })
  }

  private snapshot(): AssistantTurn {
    return { messages: this.visible.map((item) => ({ ...item })), pending: this.pending ? { ...this.pending, args: { ...this.pending.args } } : null, clientAction: this.clientAction }
  }
}

function clip(text: string): string {
  const value = text.trim()
  return value.length > RESULT_LIMIT ? `${value.slice(0, RESULT_LIMIT)}…` : value
}
