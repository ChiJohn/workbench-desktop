import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseTodos, renderTodos, type TodoItem } from '../core/todo/todoFile'
import { AppError } from '../core/result'
import type { Services } from './services'

const REL_PATH = '待办.md'

export interface TodoDispatchRequest {
  id: string
  title: string
  projectId: string | null
  agentId: string | null
}

export class TodoController {
  constructor(private services: Services) {}

  private fullPath(): string {
    return join(this.services.prefs.get().vaultPath, REL_PATH)
  }

  async list(): Promise<TodoItem[]> {
    return (await this.load()).items
  }

  async add(text: string): Promise<TodoItem[]> {
    const trimmed = text.trim()
    if (!trimmed) throw new AppError('TODO_EMPTY', '待办不能为空')
    const { items, rest } = await this.load()
    items.push({ id: '', text: trimmed.replace(/\r?\n/g, ' '), done: false, issue: null })
    await this.save(items, rest)
    return (await this.load()).items
  }

  async toggle(id: string): Promise<TodoItem[]> {
    const { items, rest } = await this.load()
    const item = items.find((i) => i.id === id)
    if (!item) throw new AppError('TODO_NOT_FOUND', '没有这条待办')
    item.done = !item.done
    await this.save(items, rest)
    return (await this.load()).items
  }

  async remove(id: string): Promise<TodoItem[]> {
    const { items, rest } = await this.load()
    const next = items.filter((i) => i.id !== id)
    if (next.length === items.length) throw new AppError('TODO_NOT_FOUND', '没有这条待办')
    await this.save(next, rest)
    return (await this.load()).items
  }

  /** 派单成功后把 identifier 写回该行；不在这里调 multica，由 IPC 层调用 */
  async markDispatched(id: string, identifier: string): Promise<TodoItem[]> {
    const { items, rest } = await this.load()
    const item = items.find((i) => i.id === id)
    if (!item) throw new AppError('TODO_NOT_FOUND', '没有这条待办')
    if (item.issue) throw new AppError('TODO_ALREADY_DISPATCHED', `已派单 ${item.issue}`)
    item.issue = identifier
    await this.save(items, rest)
    return (await this.load()).items
  }

  private async load(): Promise<{ items: TodoItem[]; rest: string[] }> {
    const full = this.fullPath()
    if (!existsSync(full)) return { items: [], rest: [] }
    return parseTodos(await readFile(full, 'utf8'))
  }

  private async save(items: TodoItem[], rest: string[]): Promise<void> {
    const full = this.fullPath()
    const tmp = `${full}.tmp`
    await writeFile(tmp, renderTodos(items, rest), 'utf8')
    await rename(tmp, full)
  }
}
