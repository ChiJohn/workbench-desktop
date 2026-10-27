import { describe, expect, it } from 'vitest'
import { parseCnbRemote } from './slug'

describe('parseCnbRemote', () => {
  it('reads a private CNB https remote', () => {
    expect(parseCnbRemote('https://cnb.jinbizhihui.com/jinbizhihui/duojing/lvcc-manage-admin.git')).toEqual({
      web: 'https://cnb.jinbizhihui.com',
      api: 'https://api.cnb.jinbizhihui.com',
      slug: 'jinbizhihui/duojing/lvcc-manage-admin'
    })
  })

  it('reads an scp remote on cnb.cool', () => {
    expect(parseCnbRemote('git@cnb.cool:cnb/feedback')).toEqual({
      web: 'https://cnb.cool',
      api: 'https://api.cnb.cool',
      slug: 'cnb/feedback'
    })
  })

  it('ignores other hosts', () => {
    expect(parseCnbRemote('https://github.com/ChiJohn/workbench-desktop.git')).toBeNull()
  })
})
