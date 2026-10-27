import { describe, expect, it } from 'vitest'
import { AppError } from '../result'
import { classifyLink, findLinks } from './links'

describe('classifyLink', () => {
  it('reads a figma node link', () => {
    expect(classifyLink('https://www.figma.com/design/FILE/Name?node-id=12-34')).toMatchObject({
      kind: 'figma',
      nodeId: '12-34',
      name: '节点 12-34'
    })
  })

  it('rejects a figma link without a node', () => {
    expect(() => classifyLink('https://www.figma.com/design/FILE/Name')).toThrow(AppError)
    try {
      classifyLink('https://www.figma.com/design/FILE/Name')
    } catch (e) {
      expect((e as AppError).code).toBe('ALIGN_FIGMA_NODE')
    }
  })

  it('reads an apifox api link', () => {
    expect(classifyLink('https://app.apifox.com/link/project/6575355/apis/api-513070612')).toEqual({
      kind: 'apifox',
      url: 'https://app.apifox.com/link/project/6575355/apis/api-513070612',
      projectId: '6575355',
      apiId: '513070612'
    })
  })

  it('rejects other links and incomplete apifox links', () => {
    expect(() => classifyLink('https://example.com/a')).toThrow(expect.objectContaining({ code: 'ALIGN_LINK' }))
    expect(() => classifyLink('https://app.apifox.com/link/project/6575355')).toThrow(
      expect.objectContaining({ message: expect.stringContaining('接口详情页') })
    )
  })
})

describe('findLinks', () => {
  it('collects valid links and skips the rest', () => {
    const text = '看 https://www.figma.com/design/F/N?node-id=1-2 和 https://www.figma.com/design/F/N 以及 https://app.apifox.com/link/project/9/apis/api-8'
    const found = findLinks(text)
    expect(found.map((l) => l.kind)).toEqual(['figma', 'apifox'])
  })
})
