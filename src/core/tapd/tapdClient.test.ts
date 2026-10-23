import { describe, expect, it } from 'vitest'
import { TapdClient } from './tapdClient'

type Call = { url: URL; init: RequestInit }

function fakeFetch(handler: (url: URL, init: RequestInit) => { status?: number; body: unknown } | Error) {
  const calls: Call[] = []
  const fn = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    const r = handler(url, init)
    if (r instanceof Error) throw r
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  }) as typeof fetch
  return { fn, calls }
}

const client = (fetchImpl: typeof fetch, token: string | null = 'tok') =>
  new TapdClient({ token: () => token ?? undefined, fetch: fetchImpl, timeoutMs: 200 })

describe('TapdClient', () => {
  it('sends the bearer token and query params', async () => {
    const f = fakeFetch(() => ({ body: { status: 1, data: { nick: '陈志强' }, info: 'success' } }))
    expect(await client(f.fn).get('/users/info', { a: '1', skip: undefined })).toEqual({ nick: '陈志强' })
    expect(f.calls[0].url.href).toBe('https://api.tapd.cn/users/info?a=1')
    expect(new Headers(f.calls[0].init.headers).get('authorization')).toBe('Bearer tok')
  })

  it('requires a token', async () => {
    const f = fakeFetch(() => ({ body: {} }))
    await expect(client(f.fn, null).get('/x')).rejects.toMatchObject({ code: 'TAPD_TOKEN_MISSING' })
    expect(f.calls).toEqual([])
  })

  it('maps invalid tokens', async () => {
    const f = fakeFetch(() => ({ status: 422, body: { status: 422, data: '', info: 'The access token provided is invalid' } }))
    await expect(client(f.fn).get('/x')).rejects.toMatchObject({ code: 'TAPD_UNAUTHORIZED' })
    const f2 = fakeFetch(() => ({ status: 401, body: {} }))
    await expect(client(f2.fn).get('/x')).rejects.toMatchObject({ code: 'TAPD_UNAUTHORIZED' })
  })

  it('maps api errors and network failures', async () => {
    const f = fakeFetch(() => ({ body: { status: 0, data: '', info: '参数错误' } }))
    await expect(client(f.fn).get('/x')).rejects.toMatchObject({ code: 'TAPD_ERROR', message: 'TAPD：参数错误' })
    const f2 = fakeFetch(() => new TypeError('fetch failed'))
    await expect(client(f2.fn).get('/x')).rejects.toMatchObject({ code: 'TAPD_NETWORK' })
  })

  it('times out', async () => {
    const slow = ((_: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as unknown as typeof fetch
    await expect(client(slow).get('/x')).rejects.toMatchObject({ code: 'TAPD_NETWORK' })
  })

  it('pages through lists and unwraps entities', async () => {
    const f = fakeFetch((url) => {
      const page = Number(url.searchParams.get('page'))
      const size = Number(url.searchParams.get('limit'))
      const count = page === 1 ? size : 1
      return { body: { status: 1, data: Array.from({ length: count }, (_, i) => ({ Story: { id: `${page}-${i}` } })) } }
    })
    const rows = await client(f.fn).listAll('/stories', { workspace_id: '1' }, 'Story', 3)
    expect(rows.map((r) => r.id)).toEqual(['1-0', '1-1', '1-2', '2-0'])
    expect(f.calls.map((c) => c.url.searchParams.get('page'))).toEqual(['1', '2'])
  })

  it('posts form data', async () => {
    const f = fakeFetch(() => ({ body: { status: 1, data: {} } }))
    await client(f.fn).post('/stories', { workspace_id: '1', id: '2', status: 'status_6' })
    expect(f.calls[0].init.method).toBe('POST')
    expect(String(f.calls[0].init.body)).toBe('workspace_id=1&id=2&status=status_6')
    expect(new Headers(f.calls[0].init.headers).get('content-type')).toBe('application/x-www-form-urlencoded')
  })
})
