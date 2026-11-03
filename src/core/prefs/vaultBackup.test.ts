import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Prefs } from '../../shared/types'
import { readVaultPrefsBackup, writeVaultPrefsBackup } from './vaultBackup'

describe('vaultBackup', () => {
  it('writes and restores non-sensitive prefs while stripping all tokens', () => {
    const vault = mkdtempSync(join(tmpdir(), 'wb-vault-bak-'))
    try {
      const prefs: Prefs = {
        vaultPath: vault,
        hotkey: 'CommandOrControl+Alt+W',
        terminal: 'wt',
        tapdTokenEnc: 'secret-tapd',
        apifoxTokenEnc: 'secret-apifox',
        cnbTokenEnc: 'secret-cnb',
        wechatDevtoolsToken: 'secret-wx',
        repos: {
          'd:/code/demo': { pinned: true, favoriteScripts: ['dev'] }
        }
      }
      expect(writeVaultPrefsBackup(prefs)).toBe(true)
      const restored = readVaultPrefsBackup(vault)
      expect(restored).toEqual({
        hotkey: 'CommandOrControl+Alt+W',
        terminal: 'wt',
        repos: {
          'd:/code/demo': { pinned: true, favoriteScripts: ['dev'] }
        }
      })
      expect(restored).not.toHaveProperty('tapdTokenEnc')
      expect(restored).not.toHaveProperty('wechatDevtoolsToken')
    } finally {
      rmSync(vault, { recursive: true, force: true })
    }
  })
})
