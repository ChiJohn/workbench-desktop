import { describe, expect, it } from 'vitest'
import { pairDiff } from '../../shared/pairDiff'

describe('pairDiff', () => {
  it('aligns a changed line beside the old line', () => {
    const text = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,3 @@',
      ' line',
      '-old',
      '+new',
      ' same'
    ].join('\n')
    expect(pairDiff(text).rows).toEqual([
      { kind: 'file', text: 'a.txt' },
      { kind: 'hunk', text: '@@ -1,3 +1,3 @@' },
      { kind: 'context', leftNo: 1, rightNo: 1, left: 'line', right: 'line' },
      { kind: 'change', leftNo: 2, rightNo: 2, left: 'old', right: 'new' },
      { kind: 'context', leftNo: 3, rightNo: 3, left: 'same', right: 'same' }
    ])
  })

  it('keeps an inserted line on the right only', () => {
    const text = ['@@ -1 +1,2 @@', ' keep', '+added'].join('\n')
    expect(pairDiff(text).rows.filter((row) => row.kind !== 'hunk')).toEqual([
      { kind: 'context', leftNo: 1, rightNo: 1, left: 'keep', right: 'keep' },
      { kind: 'add', rightNo: 2, right: 'added' }
    ])
  })

  it('reports a binary diff without inventing rows', () => {
    expect(pairDiff('Binary files a/pic.png and b/pic.png differ').binary).toBe(true)
  })
})
