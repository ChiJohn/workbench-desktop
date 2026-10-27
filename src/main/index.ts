import { app, BrowserWindow, dialog, Menu, Notification, shell } from 'electron'
import { join } from 'node:path'
import { Events } from '../shared/ipc'
import { REPORT_KIND_LABELS } from '../shared/reportPeriod'
import type { ReportKind, TapdItem } from '../shared/types'
import { HotkeyManager } from './hotkey'
import { createAppIcon } from './icon'
import { registerIpc } from './ipc'
import { ReportController } from './report'
import { KnowledgeController } from './knowledge'
import { ProjectAdmin } from '../core/registry/projectAdmin'
import { RepoClone } from '../core/registry/repoClone'
import { ReportReminder } from './reportReminder'
import { createServices, ensureWechatCli } from './services'
import { TapdPoller } from './tapdPoller'
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

function notifyNewItems(items: TapdItem[], send: (channel: string, payload?: unknown) => void): void {
  if (!Notification.isSupported()) return
  const KIND: Record<TapdItem['kind'], string> = { story: '需求', bug: '缺陷', task: '任务' }
  const notification =
    items.length === 1
      ? new Notification({ title: `TAPD 新${KIND[items[0].kind]}`, body: `${items[0].workspaceName}：${items[0].title}` })
      : new Notification({
          title: `TAPD 新分配 ${items.length} 个单子`,
          body: items
            .slice(0, 3)
            .map((i) => `${KIND[i.kind]}：${i.title}`)
            .join('\n')
        })
  notification.on('click', () => {
    showWindow()
    send(Events.tapdFocus, items[0].key)
  })
  notification.show()
}

function notifyReport(kind: ReportKind, send: (channel: string, payload?: unknown) => void): void {
  if (!Notification.isSupported()) return
  const label = REPORT_KIND_LABELS[kind]
  const notification = new Notification({ title: `该写${label}了`, body: `点击打开工作台「汇报」生成${label}` })
  notification.on('click', () => {
    showWindow()
    send(Events.reportOpen, kind)
  })
  notification.show()
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

  services.tapdToken.importFromMcp()
  const poller = new TapdPoller({
    service: services.tapd,
    seen: services.tapdSeen,
    hasToken: () => Boolean(services.tapdToken.get()),
    onBoard: (board) => send(Events.tapdUpdated, board),
    notify: (items) => notifyNewItems(items, send)
  })

  const report = new ReportController(services, (text) => send(Events.reportProgress, text))
  const knowledge = new KnowledgeController(services, (text) => send(Events.knowledgeProgress, text))
  const projects = new ProjectAdmin({
    mapPath: () => services.registry.mapPath(),
    vaultPath: () => services.prefs.get().vaultPath,
    reload: () => services.registry.load()
  })
  const clones = new RepoClone()
  registerIpc({ services, hotkey, poller, report, knowledge, projects, clones, send })
  poller.start()
  const reminder = new ReportReminder({
    prefs: () => services.prefs.get().report?.reminders,
    exists: async (kind, range) => (await report.existing(kind, range)) !== null,
    notify: (kind) => notifyReport(kind, send)
  })
  reminder.start()

  services.registry.load().catch(() => undefined)
  services.registry.watch()
  void ensureWechatCli(services)

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
      await services.release.cancelAll()
      await services.runner.stopAll()
    }
    quitting = true
    app.quit()
  })

  app.on('will-quit', () => {
    poller.stop()
    reminder.stop()
    report.cancel()
    hotkey.dispose()
    services.registry.unwatch()
    tray.destroy()
  })
}

// 开发调试时隔离偏好与单实例锁，避免影响日常使用的数据
if (process.env['WORKBENCH_USER_DATA']) app.setPath('userData', process.env['WORKBENCH_USER_DATA'])

// Windows 通知需要 AppUserModelId，否则不显示或显示为 Electron
app.setAppUserModelId('com.workbench.desktop')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // 关闭窗口只是隐藏到托盘，不退出应用
  app.on('window-all-closed', () => undefined)
  app.whenReady().then(bootstrap)
}
