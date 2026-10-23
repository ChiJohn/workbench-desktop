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

  it('persists updates to disk', () => {
    new PrefsStore(file, defaults).update({ wechatDevtoolsCli: 'C:\\cli.bat' })
    expect(JSON.parse(readFileSync(file, 'utf8')).wechatDevtoolsCli).toBe('C:\\cli.bat')
    expect(new PrefsStore(file, defaults).get().wechatDevtoolsCli).toBe('C:\\cli.bat')
  })
})
