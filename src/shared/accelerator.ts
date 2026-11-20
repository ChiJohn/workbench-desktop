export const DEFAULT_COMMAND_HOTKEY = 'CommandOrControl+P'

export interface KeyChord {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** 窗口内快捷键。CommandOrControl 在 Windows 上对应 Ctrl，也接受 Meta。 */
export function matchAccelerator(accelerator: string, event: KeyChord): boolean {
  const tokens = accelerator
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
  const keyToken = tokens.at(-1)
  if (!keyToken || tokens.length < 2) return false
  const mods = new Set(tokens.slice(0, -1))
  const orControl = mods.has('commandorcontrol') || mods.has('cmdorctrl')
  const wantCtrl = mods.has('ctrl') || mods.has('control')
  const wantMeta = mods.has('meta') || mods.has('command') || mods.has('cmd')
  const wantAlt = mods.has('alt') || mods.has('option')
  const wantShift = mods.has('shift')
  const controlOk = orControl ? event.ctrlKey || event.metaKey : wantCtrl === event.ctrlKey && wantMeta === event.metaKey
  if (!controlOk || wantAlt !== event.altKey || wantShift !== event.shiftKey) return false
  return event.key.toLowerCase() === (keyToken === 'plus' ? '+' : keyToken)
}

export function acceleratorLabel(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      const token = part.trim()
      if (/^(commandorcontrol|cmdorctrl|control|ctrl)$/i.test(token)) return 'Ctrl'
      if (/^(command|cmd|meta)$/i.test(token)) return 'Ctrl'
      if (/^alt|option$/i.test(token)) return 'Alt'
      if (/^shift$/i.test(token)) return 'Shift'
      return token.length === 1 ? token.toUpperCase() : token
    })
    .filter(Boolean)
    .join('+')
}
