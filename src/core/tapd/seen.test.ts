import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TapdItem } from '../../shared/types'
import { diffNew, SeenStore } from './seenStore'
import { readMcpToken } from './tokenSource'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wb-seen-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const item = (key: string) => ({ key }) as TapdItem

describe('new item detection', () => {
  it('reports nothing on the first run', () => {
    expect(diffNew(null, [item('a')])).toEqual([])
  })

  it('reports keys that were not seen before', () => {
    expect(diffNew(new Set(['a']), [item('a'), item('b')]).map((i) => i.key)).toEqual(['b'])
  })

  it('persists seen keys', () => {
    const file = join(dir, 'seen.json')
    expect(new SeenStore(file).load()).toBeNull()
    new SeenStore(file).save(['a', 'b'])
    expect(new SeenStore(file).load()).toEqual(new Set(['a', 'b']))
    writeFileSync(file, 'broken')
    expect(new SeenStore(file).load()).toBeNull()
  })
})

describe('readMcpToken', () => {
  const config = {
    mcpServers: { 'mcp-server-tapd': { command: 'uvx', env: { TAPD_ACCESS_TOKEN: 'abc123' } } }
  }

  it('reads utf-8 with or without BOM', () => {
    const file = join(dir, 'mcp.json')
    writeFileSync(file, '\uFEFF' + JSON.stringify(config))
    expect(readMcpToken(file)).toBe('abc123')
  })

  it('reads utf-16 written by PowerShell', () => {
    const file = join(dir, 'mcp.json')
    writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(config), 'utf16le')]))
    expect(readMcpToken(file)).toBe('abc123')
  })

  it('finds the token under another server name', () => {
    const file = join(dir, 'mcp.json')
    writeFileSync(file, JSON.stringify({ mcpServers: { tapd: { env: { TAPD_ACCESS_TOKEN: 'x' } } } }))
    expect(readMcpToken(file)).toBe('x')
  })

  it('returns undefined for missing or invalid files', () => {
    expect(readMcpToken(join(dir, 'none.json'))).toBeUndefined()
    const file = join(dir, 'bad.json')
    writeFileSync(file, '{')
    expect(readMcpToken(file)).toBeUndefined()
  })
})
