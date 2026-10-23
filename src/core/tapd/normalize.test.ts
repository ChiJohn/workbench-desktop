import { describe, expect, it } from 'vitest'
import { hasOwner, htmlToText, itemUrl, normalizeBug, normalizeStory, normalizeTask, splitOwners } from './normalize'

describe('owners', () => {
  it('splits semicolon lists', () => {
    expect(splitOwners('廖竞安;陈喜中;陈志强;')).toEqual(['廖竞安', '陈喜中', '陈志强'])
    expect(splitOwners('')).toEqual([])
    expect(splitOwners(null)).toEqual([])
  })

  it('matches exact names only', () => {
    expect(hasOwner('a;陈志强;', '陈志强')).toBe(true)
    expect(hasOwner('陈志强2;', '陈志强')).toBe(false)
  })
})

describe('htmlToText', () => {
  it('converts paragraphs, breaks, lists, links and entities', () => {
    const html =
      '<p>1、增加模块&nbsp;&amp;调整</p><p>2、标题<br/>改为 &lt;加入&gt;</p>' +
      '<ul><li>甲</li><li>乙</li></ul>' +
      '<p><a href="https://figma.com/x?a=1&amp;b=2">设计稿</a></p><p><br  /></p>'
    expect(htmlToText(html)).toBe(
      '1、增加模块 &调整\n\n2、标题\n改为 <加入>\n\n- 甲\n- 乙\n\n设计稿（https://figma.com/x?a=1&b=2）'
    )
  })

  it('does not repeat a link whose text is the url', () => {
    expect(htmlToText('<a href="https://a.com/x">https://a.com/x</a>')).toBe('https://a.com/x')
  })

  it('turns images into absolute links', () => {
    expect(htmlToText('<p><img src="/tfl/captures/a.png" alt=""/></p>')).toBe('[图片] https://www.tapd.cn/tfl/captures/a.png')
  })

  it('handles empty input', () => {
    expect(htmlToText(null)).toBe('')
  })
})

describe('normalize', () => {
  const ctx = {
    workspaceName: '多经项目',
    statusLabels: { status_4: '未启动' },
    iterations: { '1135364280001000623': '白驹两轮v3.3.8' }
  }

  it('normalizes a story', () => {
    const item = normalizeStory(
      {
        id: '1135364280001015493',
        workspace_id: '35364280',
        name: '充电订单列表新增单号',
        status: 'status_4',
        iteration_id: '1135364280001000623',
        owner: 'a;陈志强;',
        priority_label: 'High',
        modified: '2026-10-23 15:53:32',
        workitem_type_id: '1135364280001000084'
      },
      ctx
    )
    expect(item).toEqual({
      key: 'story:1135364280001015493',
      kind: 'story',
      id: '1135364280001015493',
      workspaceId: '35364280',
      workspaceName: '多经项目',
      title: '充电订单列表新增单号',
      status: 'status_4',
      statusLabel: '未启动',
      iterationId: '1135364280001000623',
      iterationName: '白驹两轮v3.3.8',
      owners: ['a', '陈志强'],
      priority: 'High',
      modified: '2026-10-23 15:53:32',
      url: 'https://www.tapd.cn/35364280/prong/stories/view/1135364280001015493',
      workitemTypeId: '1135364280001000084'
    })
  })

  it('treats iteration 0 as none and falls back to the raw status', () => {
    const bug = normalizeBug(
      { id: '9', workspace_id: '35364280', title: 'bug', status: 'new', iteration_id: '0', current_owner: '陈志强;', priority: 'medium', modified: 'm' },
      { ...ctx, statusLabels: {} }
    )
    expect(bug).toMatchObject({ kind: 'bug', iterationId: null, iterationName: null, statusLabel: 'new', priority: 'medium' })
    expect(bug.url).toBe('https://www.tapd.cn/35364280/bugtrace/bugs/view/9')
  })

  it('labels task statuses and keeps the story id', () => {
    const task = normalizeTask(
      { id: '7', workspace_id: '1', name: 't', status: 'progressing', iteration_id: '0', owner: '陈志强;', story_id: '5', modified: 'm' },
      ctx
    )
    expect(task).toMatchObject({ kind: 'task', statusLabel: '进行中', storyId: '5' })
    expect(itemUrl('task', '1', '7')).toBe('https://www.tapd.cn/1/prong/tasks/view/7')
  })
})
