import { describe, expect, it } from 'vitest'
import { listCnbBuilds, startCnbBuild } from './client'

describe('listCnbBuilds', () => {
  it('maps the latest logs and sends the bearer token', async () => {
    const calls: { url: string; authorization?: string }[] = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, authorization: new Headers(init?.headers).get('authorization') ?? undefined })
      return new Response(
        JSON.stringify({
          data: [
            {
              sn: 'cnb-1',
              status: 'success',
              title: '发布',
              targetRef: 'main',
              event: 'push',
              sha: 'abcdef123456',
              nickName: '张三',
              createTime: '2026-10-27 17:00:00',
              duration: 12000
            }
          ]
        })
      )
    }) as typeof fetch
    const builds = await listCnbBuilds({
      api: 'https://api.cnb.example.com',
      web: 'https://cnb.example.com',
      slug: 'group/repo',
      token: 'secret',
      pageSize: 5,
      fetchImpl
    })
    expect(calls[0].url).toBe('https://api.cnb.example.com/group/repo/-/build/logs?page=1&page_size=5')
    expect(calls[0].authorization).toBe('Bearer secret')
    expect(builds[0]).toMatchObject({
      sn: 'cnb-1',
      status: 'success',
      title: '发布',
      ref: 'main',
      sha: 'abcdef12',
      user: '张三',
      url: 'https://cnb.example.com/group/repo/-/build/logs/cnb-1'
    })
  })

  it('rejects an invalid token', async () => {
    const fetchImpl = (async () => new Response('', { status: 401 })) as typeof fetch
    await expect(
      listCnbBuilds({ api: 'https://api.cnb.example.com', web: 'https://cnb.example.com', slug: 'g/r', token: 'x', pageSize: 1, fetchImpl })
    ).rejects.toMatchObject({ code: 'CNB_TOKEN' })
  })
})

describe('startCnbBuild', () => {
  it('posts the selected branch and does not wait for the pipeline', async () => {
    let sent: { url: string; body?: string; authorization?: string } | undefined
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      sent = { url, body: typeof init?.body === 'string' ? init.body : undefined, authorization: new Headers(init?.headers).get('authorization') ?? undefined }
      return new Response(JSON.stringify({ success: true, sn: 'cnb-9', buildLogUrl: 'https://cnb.example.com/group/repo/-/build/logs/cnb-9', message: 'ok' }))
    }) as typeof fetch
    const result = await startCnbBuild({
      api: 'https://api.cnb.example.com',
      web: 'https://cnb.example.com',
      slug: 'group/repo',
      token: 'secret',
      branch: 'release/1.2',
      fetchImpl
    })
    expect(sent?.url).toBe('https://api.cnb.example.com/group/repo/-/build/start')
    expect(sent?.authorization).toBe('Bearer secret')
    expect(JSON.parse(sent?.body ?? '{}')).toEqual({ branch: 'release/1.2', event: 'api_trigger', sync: 'false' })
    expect(result).toEqual({ sn: 'cnb-9', url: 'https://cnb.example.com/group/repo/-/build/logs/cnb-9', message: 'ok' })
  })

  it('rejects a branch name that looks like an option', async () => {
    const fetchImpl = (async () => {
      throw new Error('should not call')
    }) as typeof fetch
    await expect(
      startCnbBuild({ api: 'https://api.cnb.example.com', web: 'https://cnb.example.com', slug: 'g/r', token: 'x', branch: '-D', fetchImpl })
    ).rejects.toMatchObject({ code: 'INVALID_BRANCH' })
  })
})
