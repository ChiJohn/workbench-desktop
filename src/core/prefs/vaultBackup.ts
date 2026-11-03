import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Prefs, PrefsPatch } from '../../shared/types'

export const VAULT_PREFS_REL = '.workbench/prefs-backup.json'

/** 剥离所有令牌与机器强绑定的 vaultPath，生成可安全存入 Vault 的备份对象 */
export function toVaultPrefsBackup(prefs: Prefs): Partial<Prefs> {
  const {
    vaultPath: _vault,
    tapdTokenEnc: _tapd,
    apifoxTokenEnc: _apifox,
    cnbTokenEnc: _cnb,
    wechatDevtoolsToken: _wxToken,
    ...safe
  } = prefs
  return safe
}

export function writeVaultPrefsBackup(prefs: Prefs): boolean {
  const vault = prefs.vaultPath?.trim()
  if (!vault || !existsSync(vault)) return false
  try {
    const file = join(vault, ...VAULT_PREFS_REL.split('/'))
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(toVaultPrefsBackup(prefs), null, 2), 'utf8')
    renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}

export function readVaultPrefsBackup(vaultPath: string): PrefsPatch | null {
  const vault = vaultPath?.trim()
  if (!vault || !existsSync(vault)) return null
  const file = join(vault, ...VAULT_PREFS_REL.split('/'))
  if (!existsSync(file)) return null
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const {
      tapdTokenEnc: _t,
      apifoxTokenEnc: _a,
      cnbTokenEnc: _c,
      wechatDevtoolsToken: _w,
      vaultPath: _v,
      ...patch
    } = raw as Record<string, unknown>
    return patch as PrefsPatch
  } catch {
    return null
  }
}
