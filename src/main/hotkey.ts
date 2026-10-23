import { globalShortcut } from 'electron'
import { AppError } from '../core/result'

export class HotkeyManager {
  private current: string | null = null

  constructor(private readonly onTrigger: () => void) {}

  /** 先注册新快捷键，成功后再注销旧的；失败时保留旧快捷键 */
  apply(accelerator: string): void {
    if (accelerator === this.current) return
    let registered = false
    try {
      registered = globalShortcut.register(accelerator, this.onTrigger)
    } catch {
      registered = false
    }
    if (!registered) {
      throw new AppError('HOTKEY_UNAVAILABLE', `快捷键 ${accelerator} 不可用：可能已被其他程序占用，或格式不正确`)
    }
    if (this.current) globalShortcut.unregister(this.current)
    this.current = accelerator
  }

  dispose(): void {
    globalShortcut.unregisterAll()
    this.current = null
  }
}
