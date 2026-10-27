import { safeStorage } from 'electron'
import { AppError } from '../core/result'
import type { PrefsStore } from '../core/prefs/prefsStore'
import type { TapdStatus } from '../shared/types'

/** CNB 访问令牌加密后放进 prefs，明文只留在主进程内存 */
export class CnbTokenStore {
  private cache: string | undefined

  constructor(private readonly prefs: PrefsStore) {}

  get(): string | undefined {
    if (this.cache === undefined) {
      const enc = this.prefs.get().cnbTokenEnc
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

  set(token: string | null): TapdStatus {
    const value = token?.trim()
    if (value) {
      if (!safeStorage.isEncryptionAvailable()) throw new AppError('ENCRYPTION_UNAVAILABLE', '系统加密不可用，无法安全保存令牌')
      this.prefs.update({ cnbTokenEnc: safeStorage.encryptString(value).toString('base64') })
      this.cache = value
    } else {
      this.prefs.update({ cnbTokenEnc: '' })
      this.cache = undefined
    }
    return { hasToken: Boolean(this.cache) }
  }

  status(): TapdStatus {
    return { hasToken: Boolean(this.get()) }
  }
}
