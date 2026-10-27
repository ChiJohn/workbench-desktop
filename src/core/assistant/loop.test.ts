import { describe, expect, it } from 'vitest'
import { AppError } from '../result'
import { AssistantLoop, type AssistantToolFns } from './loop'
import { parseToolCall, prepareCall, summarize } from './protocol'

describe('parseToolCall', () => {
  it('reads a single TOOL line and its JSON', () => {
    expect(parseToolCall('好的\nTOOL repoStatus {"project":"驴充充后台"}\n')).toEqual({
      name: 'repoStatus',
      args: { project: '驴充充后台' }
    })
  })

  it('treats prose and broken JSON as a normal answer', () => {
    expect(parseToolCall('一共 3 个项目。')).toBeNull()
    expect(parseToolCall('TOOL repoStatus {')).toBeNull()
  })
})

describe('prepareCall', () => {
  it('rejects an unknown tool without treating it as a write', () => {
    const result = prepareCall('rm', {}, 'act')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('没有「rm」')
  })

  it('refuses a write tool in ask mode', () => {
    const result = prepareCall('gitPull', { project: 'a' }, 'ask')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stop).toBe(true)
      expect(result.message).toContain('操作模式')
    }
  })

  it('summarizes a write tool for the confirm card', () => {
    expect(summarize('gitFetch', { project: '驴充充后台' })).toBe('对「驴充充后台」执行 git fetch')
    expect(summarize('openProject', { project: 'a', opener: 'cursor' })).toContain('Cursor IDE')
  })
})

function tools(executed: string[]): AssistantToolFns {
  return {
    read: async (name) => `${name}:ok`,
    previewWrite: async (name, args) => ({ summary: summarize(name, args) }),
    executeWrite: async (name) => {
      executed.push(name)
      return { text: `${name} 已执行` }
    }
  }
}

describe('AssistantLoop', () => {
  it('runs a read tool and then shows the model answer', async () => {
    const replies = ['TOOL projects', '有 2 个项目。']
    const loop = new AssistantLoop(tools([]))
    const turn = await loop.send('有哪些项目', { view: 'overview' }, { mode: 'ask', run: async () => replies.shift() ?? '' })
    expect(turn.pending).toBeNull()
    expect(turn.messages.map((item) => item.text)).toEqual(['有哪些项目', '有 2 个项目。'])
  })

  it('does not execute a write tool before confirm', async () => {
    const executed: string[] = []
    const replies = ['TOOL gitFetch {"project":"后台"}', '拉好了。']
    const loop = new AssistantLoop(tools(executed))
    const turn = await loop.send('拉一下', { view: 'overview' }, { mode: 'act', run: async () => replies.shift() ?? '' })
    expect(executed).toEqual([])
    expect(turn.pending?.summary).toBe('对「后台」执行 git fetch')
    const done = await loop.confirm()
    expect(executed).toEqual(['gitFetch'])
    expect(done.pending).toBeNull()
    expect(done.messages.at(-1)?.text).toBe('拉好了。')
  })

  it('rejects a write tool in ask mode and does not open a confirm card', async () => {
    const executed: string[] = []
    const loop = new AssistantLoop(tools(executed))
    const turn = await loop.send('拉一下', { view: 'overview' }, { mode: 'ask', run: async () => 'TOOL gitPull {"project":"后台"}' })
    expect(executed).toEqual([])
    expect(turn.pending).toBeNull()
    expect(turn.messages.at(-1)?.text).toContain('操作模式')
  })

  it('stops an unknown tool before any execution', async () => {
    const executed: string[] = []
    const loop = new AssistantLoop(tools(executed))
    const turn = await loop.send('删掉', { view: 'overview' }, { mode: 'act', run: async () => 'TOOL rm {"path":"a"}' })
    expect(executed).toEqual([])
    expect(turn.pending).toBeNull()
    expect(turn.messages.at(-1)?.text).toContain('没有「rm」')
  })

  it('refuses a second message while a confirm card is open', async () => {
    const loop = new AssistantLoop(tools([]))
    await loop.send('拉一下', { view: 'overview' }, { mode: 'act', run: async () => 'TOOL gitFetch {"project":"后台"}' })
    await expect(loop.send('再问一句', { view: 'overview' }, { mode: 'act', run: async () => '不会用到' })).rejects.toBeInstanceOf(AppError)
  })
})
