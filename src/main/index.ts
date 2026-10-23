import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { join } from 'node:path'
import { HotkeyManager } from './hotkey'
import { createAppIcon } from './icon'
import { registerIpc } from './ipc'
import { createServices } from './services'
import { createTray } from './tray'

let win: BrowserWindow | null = null
let quitting = false

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Workbench',
    icon: createAppIcon(64),
    backgroundColor: '#14161b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())
  window.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    window.hide()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (e) => e.preventDefault())
  if (!app.isPackaged) {
    window.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') window.webContents.toggleDevTools()
    })
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

function showWindow(): void {
  if (!win || win.isDestroyed()) win = createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function toggleWindow(): void {
  if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) win.hide()
  else showWindow()
}

function bootstrap(): void {
  const services = createServices()
  const hotkey = new HotkeyManager(toggleWindow)
  const send = (channel: string, payload?: unknown) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  const tray = createTray({
    showWindow,
    quit: () => app.quit(),
    running: () =>
      services.runner
        .list()
        .filter((s) => s.status === 'running')
        .map((s) => ({ runId: s.runId, label: `${services.registry.nameOf(s.projectId)}:${s.script}` })),
    stop: (runId) => void services.runner.stop(runId)
  })
  services.runner.on('started', tray.refresh)
  services.runner.on('exit', tray.refresh)

  registerIpc({ services, hotkey, send })

  services.registry.load().catch(() => undefined)
  services.registry.watch()

  Menu.setApplicationMenu(null)
  win = createWindow()

  try {
    hotkey.apply(services.prefs.get().hotkey)
  } catch (e) {
    win.once('ready-to-show', () => {
      dialog.showMessageBox(win!, {
        type: 'warning',
        message: '全局快捷键注册失败',
        detail: `${(e as Error).message}\n可以在「设置」中修改快捷键。`
      })
    })
  }

  app.on('second-instance', showWindow)

  app.on('before-quit', async (e) => {
    if (quitting) return
    e.preventDefault()
    if (services.runner.hasRunning()) {
      showWindow()
      const { response } = await dialog.showMessageBox(win!, {
        type: 'question',
        buttons: ['停止并退出', '取消'],
        defaultId: 0,
        cancelId: 1,
        message: '还有脚本正在运行',
        detail: '退出会停止所有正在运行的脚本。'
      })
      if (response !== 0) return
      await services.runner.stopAll()
    }
    quitting = true
    app.quit()
  })

  app.on('will-quit', () => {
    hotkey.dispose()
    services.registry.unwatch()
    tray.destroy()
  })
}

// 开发调试时隔离偏好与单实例锁，避免影响日常使用的数据
if (process.env['WORKBENCH_USER_DATA']) app.setPath('userData', process.env['WORKBENCH_USER_DATA'])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // 关闭窗口只是隐藏到托盘，不退出应用
  app.on('window-all-closed', () => undefined)
  app.whenReady().then(bootstrap)
}
