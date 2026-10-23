import { describe, expect, it } from 'vitest'
import { matchProjects } from './projectMatch'

const repos = [
  { id: 'd:\\job\\code\\lvcc', repoPath: 'D:\\job\\code\\lvcc', obsidianLink: 'Projects/驴充充小程序/主页' },
  { id: 'd:\\job\\code\\lvcc-manage-admin', repoPath: 'D:\\job\\code\\lvcc-manage-admin', obsidianLink: 'Projects/驴充充后台/主页' },
  { id: 'd:\\job\\code\\mono\\apps\\h5', repoPath: 'D:\\job\\code\\mono\\apps\\h5', obsidianLink: 'Projects/稽核中心H5/主页' },
  { id: 'd:\\job\\code\\mono', repoPath: 'D:\\job\\code\\mono', obsidianLink: 'Projects/mono/主页' }
]

describe('matchProjects', () => {
  it('matches by repo path in the description with a path boundary', () => {
    const r = matchProjects(
      [{ id: 'p1', title: '后台', description: '代码仓库目录：D:\\job\\code\\lvcc-manage-admin\n其他说明' }],
      repos,
      {}
    )
    expect(r.get('p1')).toEqual({ repoId: 'd:\\job\\code\\lvcc-manage-admin', matchedBy: 'path' })
  })

  it('normalizes case and slashes and prefers the longest path', () => {
    const r = matchProjects([{ id: 'p1', title: 'x', description: '仓库 `d:/job/code/mono/apps/h5/`' }], repos, {})
    expect(r.get('p1')?.repoId).toBe('d:\\job\\code\\mono\\apps\\h5')
  })

  it('falls back to the vault project folder name', () => {
    const r = matchProjects([{ id: 'p1', title: '驴充充小程序', description: '执行规范' }], repos, {})
    expect(r.get('p1')).toEqual({ repoId: 'd:\\job\\code\\lvcc', matchedBy: 'name' })
  })

  it('lets manual mappings win, including mapping to an unknown repo id being ignored', () => {
    const r = matchProjects(
      [
        { id: 'p1', title: '驴充充小程序', description: '' },
        { id: 'p2', title: 'x', description: '' }
      ],
      repos,
      { p1: 'd:\\job\\code\\mono', p2: 'd:\\gone' }
    )
    expect(r.get('p1')).toEqual({ repoId: 'd:\\job\\code\\mono', matchedBy: 'manual' })
    expect(r.get('p2')).toEqual({ repoId: null, matchedBy: null })
  })

  it('returns no match when nothing fits', () => {
    expect(matchProjects([{ id: 'p1', title: '无关', description: null }], repos, {}).get('p1')).toEqual({ repoId: null, matchedBy: null })
  })
})
