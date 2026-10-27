import { describe, expect, it } from 'vitest'
import { contractFileName, findOperation, renderContract, requireOperation } from './contract'

const doc = {
  paths: {
    '/orders/{orderId}': {
      get: {
        operationId: 'api-513070612',
        summary: '订单详情',
        parameters: [{ name: 'orderId', in: 'path', required: true, description: '订单 ID', schema: { type: 'string' } }],
        responses: {
          '200': {
            description: '成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code', 'data'],
                  properties: {
                    code: { type: 'integer', description: '业务码' },
                    data: { $ref: '#/components/schemas/Order' }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      Order: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: '订单 ID' },
          status: { type: 'string', enum: ['open', 'done'] }
        }
      }
    }
  }
}

describe('contract', () => {
  it('finds an operation by the apifox api id', () => {
    expect(findOperation(doc, '513070612')).toMatchObject({ method: 'GET', path: '/orders/{orderId}', title: '订单详情' })
    expect(findOperation(doc, 'nope')).toBeNull()
    expect(() => requireOperation(doc, 'nope')).toThrow(expect.objectContaining({ code: 'APIFOX_NOT_FOUND' }))
  })

  it('names the file from method and path', () => {
    expect(contractFileName('get', '/orders/{orderId}')).toBe('GET-orders-orderId.md')
  })

  it('renders params, expanded refs, missing fields and a typescript type', () => {
    const found = findOperation(doc, '513070612')!
    const md = renderContract(doc, found, { projectId: '9', apiId: '513070612', source: 'https://apifox/x', fetched: '2026-10-26 17:00:00' })
    expect(md).toContain('apifox_api: \'513070612\'')
    expect(md).toContain('| path | orderId | string | 是 | 订单 ID |')
    expect(md).toContain('| data.id | string | 是 | 订单 ID |')
    expect(md).toContain('| data.status | "open" \\| "done" | 否 | 未提供 |')
    expect(md).toContain('## 请求体\n\n未提供')
    expect(md).toContain('## 示例\n\n未提供')
    expect(md).toContain('export interface Api513070612Response')
    expect(md).toContain('status?: "open" | "done"')
  })
})
