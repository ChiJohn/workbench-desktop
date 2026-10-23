import { Menu, Tray, type MenuItemConstructorOptions } from 'electron'
import { createAppIcon } from './icon'

export interface TrayDeps {
  showWindow(): void
  quit(): void
  running(): { runId: string; label: string }[]
  stop(runId: string): void
}

export function createTray(deps: TrayDeps): { refresh(): void; destroy(): void } {
  const tray = new Tray(createAppIcon(16))
  tray.setToolTip('Workbench')
  tray.on('click', deps.showWindow)

  const refresh = (): void => {
    const running = deps.running()
    const runningItems: MenuItemConstructorOptions[] = running.length
      ? [
          { label: `运行中的脚本（${running.length}）`, enabled: false },
          ...running.map((r) => ({ label: `停止 ${r.label}`, click: () => deps.stop(r.runId) }))
        ]
      : [{ label: '没有运行中的脚本', enabled: false }]
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示主窗口', click: deps.showWindow },
        { type: 'separator' },
        ...runningItems,
        { type: 'separator' },
        { label: '退出', click: deps.quit }
      ])
    )
  }

  refresh()
  return { refresh, destroy: () => tray.destroy() }
}
