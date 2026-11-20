export const WORKSPACE_IDS = ['tasks', 'agents', 'multica', 'reports', 'knowledge', 'bookmarks'] as const

export type WorkspaceId = (typeof WORKSPACE_IDS)[number]

export const WORKSPACE_LABELS: Record<WorkspaceId, string> = {
  tasks: '任务',
  agents: '智能体',
  multica: 'Multica',
  reports: '汇报',
  knowledge: '知识',
  bookmarks: '收藏'
}

export interface WorkspaceNav {
  projectId: string | null
  workspace: WorkspaceId | null
  settingsOpen: boolean
}

export const SPLIT_MIN_MAIN = 980
export const COMPACT_PANE = 760
export const DEFAULT_WORKSPACE_SPLIT = 0.4
export const WORKSPACE_SPLIT_KEY = 'wb.workspaceSplit'
const SPLIT_MIN = 0.32
const SPLIT_MAX = 0.5

export function openWorkspace(state: WorkspaceNav, id: WorkspaceId): WorkspaceNav {
  return { ...state, workspace: id, settingsOpen: false }
}

export function closeWorkspace(state: WorkspaceNav): WorkspaceNav {
  return { ...state, workspace: null }
}

/** Toolbar click. A visible page toggles shut. A page hidden under settings is revealed. */
export function toggleWorkspace(state: WorkspaceNav, id: WorkspaceId): WorkspaceNav {
  if (state.settingsOpen) return openWorkspace(state, id)
  if (state.workspace === id) return closeWorkspace(state)
  return openWorkspace(state, id)
}

export function focusProject(state: WorkspaceNav, id: string): WorkspaceNav {
  return { ...state, projectId: id, settingsOpen: false }
}

export function clickProject(state: WorkspaceNav, id: string): WorkspaceNav {
  if (id !== state.projectId) return focusProject(state, id)
  if (state.settingsOpen) return { ...state, settingsOpen: false, workspace: null }
  if (state.workspace) return closeWorkspace(state)
  return state
}

export function showOverview(_state: WorkspaceNav): WorkspaceNav {
  return { projectId: null, workspace: null, settingsOpen: false }
}

export function clearProject(state: WorkspaceNav): WorkspaceNav {
  return { ...state, projectId: null }
}

export function openSettings(state: WorkspaceNav): WorkspaceNav {
  return { ...state, settingsOpen: true }
}

export function closeSettings(state: WorkspaceNav): WorkspaceNav {
  return { ...state, settingsOpen: false }
}

export function toggleSettings(state: WorkspaceNav): WorkspaceNav {
  return state.settingsOpen ? closeSettings(state) : openSettings(state)
}

export function escapeWorkspace(state: WorkspaceNav): WorkspaceNav {
  if (state.settingsOpen || !state.workspace) return state
  return closeWorkspace(state)
}

export function assistantView(state: WorkspaceNav): string {
  if (state.settingsOpen) return 'settings'
  if (state.workspace) return state.workspace
  if (state.projectId) return 'project'
  return 'overview'
}

export function toolbarActive(state: WorkspaceNav, id: 'overview' | 'settings' | WorkspaceId): boolean {
  if (id === 'settings') return state.settingsOpen
  if (state.settingsOpen) return false
  if (id === 'overview') return state.projectId === null && state.workspace === null
  return state.workspace === id
}

export function workspaceOverlay(mainWidth: number): boolean {
  return mainWidth < SPLIT_MIN_MAIN
}

export function workspaceCompact(paneWidth: number, overlay: boolean): boolean {
  return overlay || paneWidth < COMPACT_PANE
}

export function clampWorkspaceSplit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WORKSPACE_SPLIT
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value))
}

export function loadWorkspaceSplit(raw: string | null): number {
  if (raw === null) return DEFAULT_WORKSPACE_SPLIT
  return clampWorkspaceSplit(Number(raw))
}
