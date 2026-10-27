import { describe, expect, it } from 'vitest'
import { statusTone } from './statusTone'

describe('statusTone', () => {
  it('maps not-started labels to todo', () => {
    for (const label of ['未启动', '未开始', '新', '待办', '规划中']) {
      expect(statusTone(label)).toBe('todo')
    }
  })

  it('maps in-progress labels to doing', () => {
    for (const label of ['进行中', '研发中', '修复中', '待测试']) {
      expect(statusTone(label)).toBe('doing')
    }
  })

  it('maps finished labels to done', () => {
    for (const label of ['已完成', '已解决', '已关闭']) {
      expect(statusTone(label)).toBe('done')
    }
  })

  it('treats 未完成 as todo, not done', () => {
    expect(statusTone('未完成')).toBe('todo')
  })
})
