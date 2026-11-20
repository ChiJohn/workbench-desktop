import { globalShortcut } from 'electron'
import { AppError } from '../core/result'

export class HotkeyManager {
  private readonly handlers = new Map<string, () => void>()
  private readonly currents = new Map<string, string>()

  setHandler(id: string, onTrigger: () => void): void {
    this.handlers.set(id, onTrigger)
  }

  /** 空字符串表示关闭。先注册新快捷键，成功后再注销旧的。 */
  apply(id: string, accelerator: string): void {
    const onTrigger = this.handlers.get(id)
    if (!onTrigger) throw new AppError('HOTKEY_UNAVAILABLE', '快捷键还没有绑定动作')
    const next = accelerator.trim()
    const prev = this.currents.get(id) ?? ''
    if (next === prev) return
    if (!next) {
      if (prev) globalShortcut.unregister(prev)
      this.currents.delete(id)
      return
    }
    for (const [other, acc] of this.currents) {
      if (other !== id && acc === next) {
        throw new AppError('HOTKEY_UNAVAILABLE', `快捷键 ${next} 已被工作台的另一项占用`)
      }
    }
    let registered = false
    try {
      registered = globalShortcut.register(next, onTrigger)
    } catch {
      registered = false
    }
    if (!registered) {
      throw new AppError('HOTKEY_UNAVAILABLE', `快捷键 ${next} 不可用：可能已被其他程序占用，或格式不正确`)
    }
    if (prev) globalShortcut.unregister(prev)
    this.currents.set(id, next)
  }

  dispose(): void {
    for (const acc of this.currents.values()) globalShortcut.unregister(acc)
    this.currents.clear()
  }
}
