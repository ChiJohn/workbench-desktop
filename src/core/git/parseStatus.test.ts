import { describe, expect, it } from 'vitest'
import { parseBranchList, parseLastCommit, parseStatusV2 } from './parseStatus'

describe('parseStatusV2', () => {
  it('parses branch, upstream, ahead/behind and counts every kind of change', () => {
    const out = [
      '# branch.oid 1234abcd',
      '# branch.head feature/login',
      '# branch.upstream origin/feature/login',
      '# branch.ab +2 -1',
      '1 .M N... 100644 100644 100644 abc abc src/a.ts',
      '2 R. N... 100644 100644 100644 abc abc R100 new.ts\told.ts',
      'u UU N... 100644 100644 100644 100644 a b c conflict.ts',
      '? untracked.txt',
      '! ignored.txt',
      ''
    ].join('\n')
    expect(parseStatusV2(out)).toEqual({
      branch: 'feature/login',
      upstream: 'origin/feature/login',
      ahead: 2,
      behind: 1,
      changes: 4
    })
  })

  it('handles detached HEAD without upstream', () => {
    const out = '# branch.oid 1234abcd\n# branch.head (detached)\n'
    expect(parseStatusV2(out)).toEqual({ branch: null, upstream: null, ahead: 0, behind: 0, changes: 0 })
  })

  it('handles a fresh repository', () => {
    const out = '# branch.oid (initial)\n# branch.head main\n? a.txt\n'
    expect(parseStatusV2(out)).toMatchObject({ branch: 'main', upstream: null, changes: 1 })
  })

  it('accepts CRLF line endings', () => {
    expect(parseStatusV2('# branch.head main\r\n? a\r\n').changes).toBe(1)
  })
})

describe('parseLastCommit', () => {
  it('parses hash, subject and timestamp', () => {
    expect(parseLastCommit('abc1234\u0000fix: 修复 a|b\u00001700000000\n')).toEqual({
      hash: 'abc1234',
      subject: 'fix: 修复 a|b',
      timestamp: 1700000000000
    })
  })

  it('returns null for empty output', () => {
    expect(parseLastCommit('')).toBeNull()
  })
})

describe('parseBranchList', () => {
  it('marks the current branch and drops the detached pseudo entry', () => {
    const out = ' \u0000dev\n*\u0000main\n \u0000feature/x\n'
    expect(parseBranchList(out)).toEqual({ current: 'main', local: ['dev', 'main', 'feature/x'] })
  })

  it('reports null current branch when detached', () => {
    const out = '*\u0000(HEAD detached at abc123)\n \u0000main\n'
    expect(parseBranchList(out)).toEqual({ current: null, local: ['main'] })
  })
})
