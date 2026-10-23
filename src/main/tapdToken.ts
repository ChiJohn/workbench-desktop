import { safeStorage } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '../core/result'
import type { PrefsStore } from '../core/prefs/prefsStore'
import { readMcpToken } from '../core/tapd/tokenSource'
import type { TapdStatus } from '../shared/types'

const MCP_CONFIG = join(homedir(), '.cursor', 'mcp.json')

/** 令牌以 safeStorage（Windows 上为 DPAPI）加密后存进 prefs，明文只保留在主进程内存 */
export class TapdTokenStore {
  private cache: string | undefined
  private source: string | undefined

  constructor(private readonly prefs: PrefsStore) {}

  get(): string | undefined {
    if (this.cache === undefined) {
      const enc = this.prefs.get().tapdTokenEnc
      if (enc) {
        try {
          this.cache = safeStorage.decryptString(Buffer.from(enc, 'base64'))
        } catch {
          this.cache = undefined
        }
      }
    }
    return this.cache
  }

  set(token: string | null): void {
    const value = token?.trim()
    if (value) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new AppError('ENCRYPTION_UNAVAILABLE', '系统加密不可用，无法安全保存令牌')
      }
      this.prefs.update({ tapdTokenEnc: safeStorage.encryptString(value).toString('base64') })
      this.cache = value
    } else {
      this.prefs.update({ tapdTokenEnc: '' })
      this.cache = undefined
    }
    this.source = undefined
  }

  /** 从未配置过时从 Cursor 的 mcp-server-tapd 配置导入；空字符串表示用户主动清除过，不再导入 */
  importFromMcp(): boolean {
    if (this.prefs.get().tapdTokenEnc !== undefined || !safeStorage.isEncryptionAvailable()) return false
    const token = readMcpToken(MCP_CONFIG)
    if (!token) return false
    this.set(token)
    this.source = '已从 ~/.cursor/mcp.json 导入'
    return true
  }

  status(): TapdStatus {
    return { hasToken: Boolean(this.get()), ...(this.source && { source: this.source }) }
  }
}
