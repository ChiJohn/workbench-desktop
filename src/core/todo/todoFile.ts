import { createHash } from 'node:crypto'
import type { TodoItem } from '../../shared/types'

export type { TodoItem }

const LINE = /^- \[([ xX])\] (.*?)(?: <!-- wb:mc=([A-Za-z0-9-]+) -->)?$/

export function parseTodos(markdown: string): { items: TodoItem[]; rest: string[] } {
  const items: TodoItem[] = []
  const rest: string[] = []
  markdown.split(/\r?\n/).forEach((line, index) => {
    const m = LINE.exec(line)
    if (!m) {
      if (line.trim()) rest.push(line)
      return
    }
    const text = m[2]
    items.push({ id: todoId(text, index), text, done: m[1] !== ' ', issue: m[3] ?? null })
  })
  return { items, rest }
}

export function renderTodos(items: TodoItem[], rest: string[]): string {
  const lines = items.map((item) => {
    const box = item.done ? 'x' : ' '
    const mark = item.issue ? ` <!-- wb:mc=${item.issue} -->` : ''
    return `- [${box}] ${item.text}${mark}`
  })
  return [...lines, ...rest].join('\n') + (lines.length || rest.length ? '\n' : '')
}

function todoId(text: string, index: number): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 8) + index.toString(36)
}
