import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ApifoxClient } from './apifoxClient'
import { attachApi, attachFigma, listAlign } from './attach'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

const doc = { paths: { '/orders': { post: { operationId: 'api-8', summary: '创建订单', responses: { '200': { description: 'ok' } } } } } }

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('ApifoxClient', () => {
  it('exports once and then uses the cache', async () => {
    let calls = 0
    const client = new ApifoxClient({
      token: () => 'secret',
      now: () => 0,
      fetch: async () => {
        calls += 1
        return response(200, doc)
      }
    })
    const first = await client.operation({ kind: 'apifox', url: 'u', projectId: '9', apiId: '8' })
    await client.operation({ kind: 'apifox', url: 'u', projectId: '9', apiId: '8' })
    expect(first.found.title).toBe('创建订单')
    expect(calls).toBe(1)
  })

  it('reports an invalid token, a missing api and a network failure', async () => {
    const link = { kind: 'apifox' as const, url: 'u', projectId: '9', apiId: '8' }
    const make = (fetch: (url: string, init: RequestInit) => Promise<Response>) => new ApifoxClient({ token: () => 'secret', now: () => 0, fetch })
    await expect(make(async () => response(401, {})).operation(link)).rejects.toMatchObject({ code: 'APIFOX_TOKEN' })
    await expect(make(async () => response(200, { paths: {} })).operation(link)).rejects.toMatchObject({ code: 'APIFOX_NOT_FOUND' })
    await expect(
      make(async () => {
        throw new Error('timeout')
      }).operation(link)
    ).rejects.toMatchObject({ code: 'APIFOX_FAILED' })
    await expect(new ApifoxClient({ token: () => undefined, now: () => 0, fetch: async () => response(200, doc) }).operation(link)).rejects.toMatchObject({
      message: expect.stringContaining('设置 → Apifox')
    })
  })
})

describe('attach', () => {
  it('links an existing contract without fetching again', async () => {
    const vault = await mkdtemp(join(tmpdir(), 'wb-align-'))
    dirs.push(vault)
    const card = '任务/a.md'
    await import('node:fs/promises').then((fs) => fs.mkdir(join(vault, '任务'), { recursive: true }))
    await import('node:fs/promises').then((fs) => fs.writeFile(join(vault, card), '## 描述\n\nx\n\n## 概况\n\n待填写。\n'))
    let loads = 0
    const load = async () => {
      loads += 1
      return { doc, found: { method: 'POST', path: '/orders', title: '创建订单', operation: doc.paths['/orders'].post, parameters: [] } }
    }
    const link = { kind: 'apifox' as const, url: 'https://app.apifox.com/link/project/9/apis/api-8', projectId: '9', apiId: '8' }
    await attachApi(vault, card, '旅游后台', link, load, new Date('2026-10-26T09:00:00'), false)
    await attachApi(vault, card, '旅游后台', link, load, new Date('2026-10-26T09:00:00'), false)
    expect(loads).toBe(1)
    const saved = await readFile(join(vault, '项目', '旅游后台', '接口', 'POST-orders.md'), 'utf8')
    expect(saved).toContain('apifox_api: \'8\'')
    const listed = await listAlign(vault, card)
    expect(listed.apis).toEqual([{ title: '创建订单', target: '项目/旅游后台/接口/POST-orders', path: '项目/旅游后台/接口/POST-orders.md', url: link.url }])
    await attachFigma(vault, card, { kind: 'figma', url: 'https://www.figma.com/design/F/N?node-id=1-2', nodeId: '1-2', name: '节点 1-2' })
    expect((await listAlign(vault, card)).designs).toHaveLength(1)
  })
})
