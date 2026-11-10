import { create } from 'zustand'
import type { ReportKind } from '../../../shared/types'
import {
  clearProject,
  clickProject,
  closeSettings,
  closeWorkspace,
  escapeWorkspace,
  focusProject,
  openSettings,
  openWorkspace,
  showOverview,
  toggleSettings,
  toggleWorkspace,
  type WorkspaceId,
  type WorkspaceNav
} from '../../../shared/workspaceNav'

export type LogDock = 'bottom' | 'right' | 'left' | 'maximized'

interface UiState {
  projectId: string | null
  workspace: WorkspaceId | null
  settingsOpen: boolean
  search: string
  logOpen: boolean
  /** 终端/日志面板停靠位置（类似 Chrome DevTools） */
  logDock: LogDock
  /** 最大化前的停靠位置，用于一键还原 */
  prevLogDock: 'bottom' | 'right' | 'left'
  /** 日志面板当前选中的标签 */
  logTab: { kind: 'run' | 'shell'; id: string } | null
  /** 任务页选中的单子 key */
  taskKey: string | null
  /** 智能体页选中的 multica issue id */
  issueId: string | null
  openWorkspace(id: WorkspaceId): void
  toggleWorkspace(id: WorkspaceId): void
  closeWorkspace(): void
  focusProject(id: string): void
  clickProject(id: string): void
  showOverview(): void
  clearProject(): void
  openSettings(): void
  closeSettings(): void
  toggleSettings(): void
  escapeWorkspace(): void
  setSearch(search: string): void
  setLogOpen(open: boolean): void
  setLogDock(dock: LogDock): void
  setLogTab(tab: { kind: 'run' | 'shell'; id: string } | null): void
  setTaskKey(key: string | null): void
  setIssueId(id: string | null): void
  /** 打开智能体工作区并选中 issue，当前项目保持不动 */
  openIssue(id: string): void
  /** 任务完成后待沉淀的任务卡 */
  deposit: { task: string; title: string; project: string } | null
  offerDeposit(deposit: { task: string; title: string; project: string }): void
  clearDeposit(): void
  /** 新增或编辑项目；新增时可以带上助手填好的名称和路径 */
  projectEditor: { mode: 'add'; name?: string; repoPath?: string } | { mode: 'edit'; id: string } | null
  openProjectEditor(editor: { mode: 'add'; name?: string; repoPath?: string } | { mode: 'edit'; id: string }): void
  closeProjectEditor(): void
  /** 助手要求打开的派单窗口 */
  dispatchDraft: { tapdKey: string; title?: string } | null
  setDispatchDraft(draft: { tapdKey: string; title?: string }): void
  clearDispatchDraft(): void
  /** 助手要求打开的汇报页 */
  reportDraft: { kind: ReportKind; notes?: string } | null
  setReportDraft(draft: { kind: ReportKind; notes?: string }): void
  clearReportDraft(): void
  /** 模块折叠状态：key → 是否收起 */
  collapsedCards: Record<string, boolean>
  toggleCard(key: string, defaultOpen?: boolean): void
  /** Ctrl+P 全局命令面板 */
  commandOpen: boolean
  setCommandOpen(open: boolean): void
}

const COLLAPSED_STORAGE_KEY = 'wb.collapsedCards'
const LOG_DOCK_STORAGE_KEY = 'wb.logDock'

function loadLogDock(): LogDock {
  try {
    const raw = localStorage.getItem(LOG_DOCK_STORAGE_KEY)
    return raw === 'right' || raw === 'left' || raw === 'maximized' ? raw : 'bottom'
  } catch {
    return 'bottom'
  }
}

function loadCollapsedCards(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function navOf(state: WorkspaceNav): WorkspaceNav {
  return { projectId: state.projectId, workspace: state.workspace, settingsOpen: state.settingsOpen }
}

export const useUi = create<UiState>((set) => ({
  projectId: null,
  workspace: null,
  settingsOpen: false,
  search: '',
  logOpen: true,
  logDock: loadLogDock(),
  prevLogDock: 'bottom',
  logTab: null,
  taskKey: null,
  issueId: null,
  openWorkspace: (id) => set((state) => openWorkspace(navOf(state), id)),
  toggleWorkspace: (id) => set((state) => toggleWorkspace(navOf(state), id)),
  closeWorkspace: () => set((state) => closeWorkspace(navOf(state))),
  focusProject: (id) => set((state) => focusProject(navOf(state), id)),
  clickProject: (id) => set((state) => clickProject(navOf(state), id)),
  showOverview: () => set((state) => showOverview(navOf(state))),
  clearProject: () => set((state) => clearProject(navOf(state))),
  openSettings: () => set((state) => openSettings(navOf(state))),
  closeSettings: () => set((state) => closeSettings(navOf(state))),
  toggleSettings: () => set((state) => toggleSettings(navOf(state))),
  escapeWorkspace: () => set((state) => escapeWorkspace(navOf(state))),
  setSearch: (search) => set({ search }),
  setLogOpen: (logOpen) =>
    set((state) => ({
      logOpen,
      // 最大化状态下点收起时自动还原回普通停靠位置
      logDock: !logOpen && state.logDock === 'maximized' ? state.prevLogDock : state.logDock
    })),
  setLogDock: (nextDock) =>
    set((state) => {
      // 再次点击「最大化」时自动还原回最大化前的停靠位置
      const resolved: LogDock =
        nextDock === 'maximized' && state.logDock === 'maximized' ? state.prevLogDock : nextDock
      const prevLogDock =
        resolved !== 'maximized' ? resolved : state.logDock !== 'maximized' ? state.logDock : state.prevLogDock
      try {
        localStorage.setItem(LOG_DOCK_STORAGE_KEY, resolved)
      } catch {
        // ignore
      }
      return { logDock: resolved, prevLogDock, logOpen: true }
    }),
  setLogTab: (logTab) => set({ logTab }),
  setTaskKey: (taskKey) => set({ taskKey }),
  setIssueId: (issueId) => set({ issueId }),
  openIssue: (issueId) => set((state) => ({ ...openWorkspace(navOf(state), 'agents'), issueId })),
  deposit: null,
  offerDeposit: (deposit) => set({ deposit }),
  clearDeposit: () => set({ deposit: null }),
  projectEditor: null,
  openProjectEditor: (projectEditor) => set({ projectEditor }),
  closeProjectEditor: () => set({ projectEditor: null }),
  dispatchDraft: null,
  setDispatchDraft: (dispatchDraft) => set({ dispatchDraft }),
  clearDispatchDraft: () => set({ dispatchDraft: null }),
  reportDraft: null,
  setReportDraft: (reportDraft) => set({ reportDraft }),
  clearReportDraft: () => set({ reportDraft: null }),
  collapsedCards: loadCollapsedCards(),
  toggleCard: (key, defaultOpen = true) =>
    set((state) => {
      const currentCollapsed = state.collapsedCards[key] ?? !defaultOpen
      const next = { ...state.collapsedCards, [key]: !currentCollapsed }
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return { collapsedCards: next }
    }),
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen })
}))
