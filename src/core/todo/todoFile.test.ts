import { describe, expect, it } from 'vitest'
import { parseTodos, renderTodos, type TodoItem } from './todoFile'

describe('todoFile', () => {
  const sample = ['- [ ] 核对退款接口', '- [x] 已核对', '- [ ] 补周报 <!-- wb:mc=JIN-128 -->', '普通笔记'].join('\n')

  it('parses checkboxes, done state and dispatch marks, keeping unknown lines', () => {
    const { items, rest } = parseTodos(sample)
    expect(items.map((i) => [i.text, i.done, i.issue])).toEqual([
      ['核对退款接口', false, null],
      ['已核对', true, null],
      ['补周报', false, 'JIN-128']
    ])
    expect(rest).toEqual(['普通笔记'])
    expect(new Set(items.map((i) => i.id)).size).toBe(3)
  })

  it('round-trips items and preserves unknown lines', () => {
    const parsed = parseTodos(sample)
    const toggled: TodoItem[] = parsed.items.map((i) => (i.text === '核对退款接口' ? { ...i, done: true } : i))
    const md = renderTodos(toggled, parsed.rest)
    const again = parseTodos(md)
    expect(again.items[0]).toMatchObject({ text: '核对退款接口', done: true, issue: null })
    expect(again.items[2].issue).toBe('JIN-128')
    expect(again.rest).toEqual(['普通笔记'])
  })

  it('renders an empty file as empty', () => {
    expect(renderTodos([], [])).toBe('')
  })
})
