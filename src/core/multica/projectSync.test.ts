import { describe, expect, it } from 'vitest'
import { planProjectSync } from './projectSync'

const admin = {
  id: 'd:\\job\\code\\lvcc-manage-admin',
  name: '驴充充后台',
  repoPath: 'D:\\job\\code\\lvcc-manage-admin',
  obsidianLink: 'Projects/驴充充后台/主页',
  available: true
}
const mini = {
  id: 'd:\\job\\code\\lvcc',
  name: '驴充充小程序',
  repoPath: 'D:\\job\\code\\lvcc',
  obsidianLink: 'Projects/驴充充小程序/主页',
  available: true
}

describe('planProjectSync', () => {
  it('creates a project when nothing matches, and leaves a path match unchanged', () => {
    const plan = planProjectSync(
      [{ id: 'p1', title: '后台', description: '代码仓库目录：D:\\job\\code\\lvcc-manage-admin' }],
      [admin, mini],
      {}
    )
    expect(plan.unchanged).toBe(1)
    expect(plan.create).toEqual([
      { repoId: mini.id, title: '驴充充小程序', description: '代码仓库目录：D:\\job\\code\\lvcc' }
    ])
    expect(plan.update).toEqual([])
  })

  it('appends the repo path when the match is only by folder name', () => {
    const plan = planProjectSync([{ id: 'p1', title: '驴充充小程序', description: '执行规范' }], [mini], {})
    expect(plan.update).toEqual([
      {
        repoId: mini.id,
        title: '驴充充小程序',
        projectId: 'p1',
        description: '执行规范\n\n代码仓库目录：D:\\job\\code\\lvcc'
      }
    ])
  })

  it('replaces an outdated repo path line', () => {
    const plan = planProjectSync(
      [{ id: 'p1', title: '驴充充小程序', description: '说明\n代码仓库目录：D:\\old\\lvcc\n保留' }],
      [mini],
      { p1: mini.id }
    )
    expect(plan.update[0]?.description).toBe('说明\n代码仓库目录：D:\\job\\code\\lvcc\n保留')
  })

  it('skips a repo whose directory is missing', () => {
    const plan = planProjectSync([], [{ ...mini, available: false }], {})
    expect(plan).toMatchObject({ create: [], update: [], unchanged: 0, unavailable: 1 })
  })

  it('does not attach one multica project to two repos', () => {
    const plan = planProjectSync([{ id: 'p1', title: '共享', description: '' }], [admin, mini], { p1: mini.id })
    expect(plan.update.map((item) => item.repoId)).toEqual([mini.id])
    expect(plan.create.map((item) => item.repoId)).toEqual([admin.id])
  })
})
