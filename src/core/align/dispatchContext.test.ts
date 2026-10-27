import { describe, expect, it } from 'vitest'
import { renderAlignForDispatch } from './dispatchContext'
import { mcpSnippet } from './mcpSnippet'

describe('renderAlignForDispatch', () => {
  it('includes the figma and api instructions', () => {
    const text = renderAlignForDispatch(
      [{ name: '首页', url: 'https://www.figma.com/design/F/N?node-id=1-2' }],
      [{ title: '订单详情', path: '项目/旅游后台/接口/GET-orders.md', body: '# 订单详情\n\n`GET /orders`' }]
    )
    expect(text).toContain('get_design_context')
    expect(text).toContain('若无法访问 Figma MCP')
    expect(text).toContain('以本契约为准')
    expect(text).toContain('`GET /orders`')
  })

  it('drops examples when the text is too long', () => {
    const body = `# 大接口\n\n## 请求参数\n\n无\n\n## 示例\n\n${'x'.repeat(20_000)}\n\n## TypeScript\n\n\`\`\`ts\ntype A = string\n\`\`\``
    const text = renderAlignForDispatch([], [{ title: '大接口', path: '项目/a/接口/GET-a.md', body }])
    expect(text).toContain('示例已省略')
    expect(text).toContain('项目/a/接口/GET-a.md')
    expect(text).not.toContain('x'.repeat(100))
    expect(text).toContain('type A = string')
  })
})

describe('mcpSnippet', () => {
  it('builds a windows config without a token', () => {
    const text = mcpSnippet('6575355')
    expect(text).toContain('apifox-mcp-server@latest')
    expect(text).toContain('--project=6575355')
    expect(text).toContain('"command": "cmd"')
    expect(text).not.toMatch(/token|Bearer/i)
    expect(() => mcpSnippet('abc')).toThrow(expect.objectContaining({ code: 'ALIGN_LINK' }))
  })
})
