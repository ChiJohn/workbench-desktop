import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { Channels, Events, type WorkbenchApi } from '../shared/ipc'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: WorkbenchApi = {
  registry: {
    list: () => invoke(Channels.registryList)
  },
  git: {
    statusAll: () => invoke(Channels.gitStatusAll),
    status: (id) => invoke(Channels.gitStatus, id),
    fetchAll: () => invoke(Channels.gitFetchAll),
    fetch: (id) => invoke(Channels.gitFetch, id),
    pull: (id) => invoke(Channels.gitPull, id),
    branches: (id) => invoke(Channels.gitBranches, id),
    checkout: (id, branch) => invoke(Channels.gitCheckout, id, branch),
    createBranch: (id, branch) => invoke(Channels.gitCreateBranch, id, branch)
  },
  runner: {
    scripts: (id) => invoke(Channels.runnerScripts, id),
    start: (id, script) => invoke(Channels.runnerStart, id, script),
    stop: (runId) => invoke(Channels.runnerStop, runId),
    list: () => invoke(Channels.runnerList),
    buffer: (runId) => invoke(Channels.runnerBuffer, runId),
    dispose: (runId) => invoke(Channels.runnerDispose, runId)
  },
  launcher: {
    open: (id, opener) => invoke(Channels.launcherOpen, id, opener)
  },
  release: {
    info: (id) => invoke(Channels.releaseInfo, id),
    start: (req) => invoke(Channels.releaseStart, req),
    cancel: (jobId) => invoke(Channels.releaseCancel, jobId),
    list: () => invoke(Channels.releaseList)
  },
  tapd: {
    status: () => invoke(Channels.tapdStatus),
    setToken: (token) => invoke(Channels.tapdSetToken, token),
    board: (force) => invoke(Channels.tapdBoard, force),
    detail: (key) => invoke(Channels.tapdDetail, key),
    transition: (key, to) => invoke(Channels.tapdTransition, key, to),
    createCard: (key, projectId) => invoke(Channels.tapdCreateCard, key, projectId),
    openCard: (relPath) => invoke(Channels.tapdOpenCard, relPath)
  },
  settings: {
    get: () => invoke(Channels.settingsGet),
    set: (patch) => invoke(Channels.settingsSet, patch)
  },
  app: {
    openExternal: (url) => invoke(Channels.appOpenExternal, url)
  },
  on: {
    registryChanged: (cb) => subscribe(Events.registryChanged, cb),
    runnerOutput: (cb) => subscribe(Events.runnerOutput, cb),
    runnerExit: (cb) => subscribe(Events.runnerExit, cb),
    runnerStarted: (cb) => subscribe(Events.runnerStarted, cb),
    releaseChanged: (cb) => subscribe(Events.releaseChanged, cb),
    tapdUpdated: (cb) => subscribe(Events.tapdUpdated, cb),
    tapdFocus: (cb) => subscribe(Events.tapdFocus, cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
