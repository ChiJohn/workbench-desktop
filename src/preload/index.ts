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
    createBranch: (id, branch) => invoke(Channels.gitCreateBranch, id, branch),
    changes: (id) => invoke(Channels.gitChanges, id),
    diff: (id, path) => invoke(Channels.gitDiff, id, path)
  },
  multica: {
    overview: (force) => invoke(Channels.multicaOverview, force),
    issue: (id) => invoke(Channels.multicaIssue, id),
    findByTapd: (tapdKey) => invoke(Channels.multicaFindByTapd, tapdKey),
    dispatch: (req) => invoke(Channels.multicaDispatch, req),
    comment: (id, text) => invoke(Channels.multicaComment, id, text),
    complete: (id, commit) => invoke(Channels.multicaComplete, id, commit),
    backfill: (id) => invoke(Channels.multicaBackfill, id),
    launchDesktop: () => invoke(Channels.multicaLaunchDesktop)
  },
  runner: {
    scripts: (id) => invoke(Channels.runnerScripts, id),
    start: (id, script) => invoke(Channels.runnerStart, id, script),
    stop: (runId) => invoke(Channels.runnerStop, runId),
    list: () => invoke(Channels.runnerList),
    buffer: (runId) => invoke(Channels.runnerBuffer, runId),
    dispose: (runId) => invoke(Channels.runnerDispose, runId)
  },
  shell: {
    open: (projectId, cols, rows) => invoke(Channels.shellOpen, projectId, cols, rows),
    write: (id, data) => invoke(Channels.shellWrite, id, data),
    resize: (id, cols, rows) => invoke(Channels.shellResize, id, cols, rows),
    close: (id) => invoke(Channels.shellClose, id),
    list: () => invoke(Channels.shellList),
    buffer: (id) => invoke(Channels.shellBuffer, id)
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
  apifox: {
    status: () => invoke(Channels.apifoxStatus),
    setToken: (token) => invoke(Channels.apifoxSetToken, token)
  },
  align: {
    list: (key) => invoke(Channels.alignList, key),
    add: (key, url) => invoke(Channels.alignAdd, key, url),
    refresh: (key, url) => invoke(Channels.alignRefresh, key, url),
    remove: (key, urlOrTarget) => invoke(Channels.alignRemove, key, urlOrTarget),
    rename: (key, url, name) => invoke(Channels.alignRename, key, url, name),
    mcpSnippet: (projectId) => invoke(Channels.alignMcpSnippet, projectId)
  },
  report: {
    collect: (kind, range) => invoke(Channels.reportCollect, kind, range),
    generate: (req) => invoke(Channels.reportGenerate, req),
    cancel: () => invoke(Channels.reportCancel),
    save: (kind, range, content) => invoke(Channels.reportSave, kind, range, content)
  },
  knowledge: {
    ask: (req) => invoke(Channels.knowledgeAsk, req),
    cancel: () => invoke(Channels.knowledgeCancel),
    search: (query, project) => invoke(Channels.knowledgeSearch, query, project),
    draft: (req) => invoke(Channels.knowledgeDraft, req),
    save: (req) => invoke(Channels.knowledgeSave, req)
  },
  assistant: {
    send: (text, context) => invoke(Channels.assistantSend, text, context),
    confirm: () => invoke(Channels.assistantConfirm),
    cancel: () => invoke(Channels.assistantCancel)
  },
  project: {
    add: (req) => invoke(Channels.projectAdd, req),
    update: (id, req) => invoke(Channels.projectUpdate, id, req),
    remove: (id) => invoke(Channels.projectRemove, id),
    detectType: (dir) => invoke(Channels.projectDetectType, dir),
    clone: (req) => invoke(Channels.projectClone, req),
    cancelClone: () => invoke(Channels.projectCancelClone)
  },
  settings: {
    get: () => invoke(Channels.settingsGet),
    set: (patch) => invoke(Channels.settingsSet, patch)
  },
  vault: {
    init: (path) => invoke(Channels.vaultInit, path)
  },
  app: {
    openExternal: (url) => invoke(Channels.appOpenExternal, url),
    pickFolder: (defaultPath) => invoke(Channels.appPickFolder, defaultPath)
  },
  stickyNote: {
    read: () => invoke(Channels.stickyNoteRead),
    write: (text) => invoke(Channels.stickyNoteWrite, text)
  },
  todo: {
    list: () => invoke(Channels.todoList),
    add: (text) => invoke(Channels.todoAdd, text),
    toggle: (id) => invoke(Channels.todoToggle, id),
    remove: (id) => invoke(Channels.todoRemove, id),
    dispatch: (req) => invoke(Channels.todoDispatch, req)
  },
  on: {
    registryChanged: (cb) => subscribe(Events.registryChanged, cb),
    runnerOutput: (cb) => subscribe(Events.runnerOutput, cb),
    runnerExit: (cb) => subscribe(Events.runnerExit, cb),
    runnerStarted: (cb) => subscribe(Events.runnerStarted, cb),
    shellOutput: (cb) => subscribe(Events.shellOutput, cb),
    shellExit: (cb) => subscribe(Events.shellExit, cb),
    releaseChanged: (cb) => subscribe(Events.releaseChanged, cb),
    tapdUpdated: (cb) => subscribe(Events.tapdUpdated, cb),
    tapdFocus: (cb) => subscribe(Events.tapdFocus, cb),
    reportProgress: (cb) => subscribe(Events.reportProgress, cb),
    reportOpen: (cb) => subscribe(Events.reportOpen, cb),
    knowledgeProgress: (cb) => subscribe(Events.knowledgeProgress, cb),
    assistantProgress: (cb) => subscribe(Events.assistantProgress, cb),
    projectCloneProgress: (cb) => subscribe(Events.projectCloneProgress, cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
