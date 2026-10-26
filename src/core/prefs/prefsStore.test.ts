import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Prefs } from '../../shared/types'
import { PrefsStore } from './prefsStore'

let dir: string
let file: string

const defaults: Prefs = {
  vaultPath: 'D:\\vault',
  hotkey: 'CommandOrControl+Alt+W',
  terminal: 'wt',
  repos: {}
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wb-prefs-'))
  file = join(dir, 'nested', 'prefs.json')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('PrefsStore', () => {
  it('returns defaults when the file does not exist', () => {
    expect(new PrefsStore(file, defaults).get()).toEqual(defaults)
  })

  it('falls back to defaults when the file is corrupt', () => {
    const store = new PrefsStore(file, defaults)
    store.update({ terminal: 'powershell' })
    writeFileSync(file, '{ not json')
    expect(new PrefsStore(file, defaults).get()).toEqual(defaults)
  })

  it('fills in missing keys from defaults', () => {
    const store = new PrefsStore(file, defaults)
    store.update({})
    writeFileSync(file, JSON.stringify({ terminal: 'powershell' }))
    expect(new PrefsStore(file, defaults).get()).toEqual({ ...defaults, terminal: 'powershell' })
  })

  it('merges top-level keys shallowly and repo entries per repo', () => {
    const store = new PrefsStore(file, defaults)
    store.update({ repos: { a: { pinned: true, favoriteScripts: ['dev'] }, b: { pinned: true } } })
    const next = store.update({ hotkey: 'Alt+X', repos: { a: { favoriteScripts: ['build'] } } })
    expect(next).toEqual({
      ...defaults,
      hotkey: 'Alt+X',
      repos: { a: { pinned: true, favoriteScripts: ['build'] }, b: { pinned: true } }
    })
  })

  it('merges tapd repo mappings per key and drops empty values', () => {
    const store = new PrefsStore(file, defaults)
    store.update({ tapd: { disabledWorkspaces: ['1'], iterationRepos: { it1: 'a', it2: 'b' }, itemRepos: { 'bug:1': 'a' } } })
    const next = store.update({ tapd: { iterationRepos: { it2: '', it3: 'c' } } })
    expect(next.tapd).toEqual({
      disabledWorkspaces: ['1'],
      iterationRepos: { it1: 'a', it3: 'c' },
      itemRepos: { 'bug:1': 'a' }
    })
    expect(store.update({ tapd: { disabledWorkspaces: [] } }).tapd?.disabledWorkspaces).toEqual([])
  })

  it('merges multica project mappings per key and keeps other multica prefs', () => {
    const store = new PrefsStore(file, defaults)
    store.update({ multica: { workspaceId: 'w1', projectMap: { p1: 'a', p2: 'b' } } })
    const next = store.update({ multica: { lastAgentId: 'ag', projectMap: { p1: '' } } })
    expect(next.multica).toEqual({ workspaceId: 'w1', lastAgentId: 'ag', projectMap: { p2: 'b' } })
  })

  it('merges report notes per key and reminder settings field by field', () => {
    const store = new PrefsStore(file, defaults)
    store.update({ report: { writer: 'cursor', notes: { 'weekly:2026-10-17': '周会', 'daily:2026-10-23': 'x' }, reminders: { daily: '18:00' } } })
    const next = store.update({ report: { notes: { 'daily:2026-10-23': '' }, reminders: { enabled: false } } })
    expect(next.report).toEqual({ writer: 'cursor', notes: { 'weekly:2026-10-17': '周会' }, reminders: { daily: '18:00', enabled: false } })
  })

  it('persists updates to disk', () => {
    new PrefsStore(file, defaults).update({ wechatDevtoolsCli: 'C:\\cli.bat' })
    expect(JSON.parse(readFileSync(file, 'utf8')).wechatDevtoolsCli).toBe('C:\\cli.bat')
    expect(new PrefsStore(file, defaults).get().wechatDevtoolsCli).toBe('C:\\cli.bat')
  })
})
