import { describe, expect, it } from 'vitest'
import { normalizeRepoPath } from './paths'

describe('normalizeRepoPath', () => {
  it('lowercases and unifies separators', () => {
    expect(normalizeRepoPath('D:/Job/Code/Hyx-H5')).toBe('d:\\job\\code\\hyx-h5')
  })

  it('strips trailing separators and whitespace', () => {
    expect(normalizeRepoPath('  D:\\job\\code\\cli\\\\ ')).toBe('d:\\job\\code\\cli')
  })

  it('treats equivalent paths as equal', () => {
    expect(normalizeRepoPath('D:\\job\\code\\cli')).toBe(normalizeRepoPath('d:/job/code/cli/'))
  })
})
