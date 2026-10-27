import { describe, expect, it } from 'vitest'
import { addApi, addDesign, readAlign, removeAlign, renameDesign } from './cardSection'

const CARD = `## 描述

正文

## 概况

待填写。
`

describe('card section', () => {
  it('inserts the section between the description and the summary', () => {
    const md = addDesign(CARD, { kind: 'figma', url: 'https://www.figma.com/design/F/N?node-id=1-2', nodeId: '1-2', name: '节点 1-2' })
    expect(md.indexOf('## 设计与接口')).toBeGreaterThan(md.indexOf('## 描述'))
    expect(md.indexOf('## 设计与接口')).toBeLessThan(md.indexOf('## 概况'))
    expect(readAlign(md).designs).toEqual([{ name: '节点 1-2', url: 'https://www.figma.com/design/F/N?node-id=1-2' }])
  })

  it('renames, adds an api link, and removes either', () => {
    let md = addDesign(CARD, { kind: 'figma', url: 'https://figma.com/x?node-id=1-2', nodeId: '1-2', name: '节点 1-2' })
    md = renameDesign(md, 'https://figma.com/x?node-id=1-2', '首页')
    md = addApi(md, { target: '项目/旅游后台/接口/GET-orders', title: '订单详情' })
    expect(readAlign(md)).toEqual({
      designs: [{ name: '首页', url: 'https://figma.com/x?node-id=1-2' }],
      apis: [{ target: '项目/旅游后台/接口/GET-orders', title: '订单详情' }]
    })
    md = removeAlign(md, 'https://figma.com/x?node-id=1-2')
    md = removeAlign(md, '项目/旅游后台/接口/GET-orders')
    expect(readAlign(md)).toEqual({ designs: [], apis: [] })
    expect(md).toContain('## 概况')
  })
})
