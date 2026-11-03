import { describe, expect, it } from 'vitest'
import { buildCommitPrompt, cleanCommitMessage } from './commitPrompt'

describe('commitPrompt', () => {
  it('builds prompt with files, recent subjects and diff', () => {
    const prompt = buildCommitPrompt({
      files: [{ code: ' M', path: 'src/App.tsx' }],
      diff: '+const a = 1',
      recentSubjects: ['feat: 增加构建记录']
    })
    expect(prompt).toContain('M src/App.tsx')
    expect(prompt).toContain('feat: 增加构建记录')
    expect(prompt).toContain('+const a = 1')
  })

  it('cleans markdown fences and prefixes from model output', () => {
    expect(cleanCommitMessage('```text\nfeat: 支持 AI 生成提交信息\n```')).toBe('feat: 支持 AI 生成提交信息')
    expect(cleanCommitMessage('提交信息：fix: 修复子目录仓库 diff 预览为空')).toBe('fix: 修复子目录仓库 diff 预览为空')
  })
})
