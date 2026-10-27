import { create } from 'zustand'
import type { ReportKind } from '../../../shared/types'

export type View =
  | { kind: 'overview' }
  | { kind: 'project'; id: string }
  | { kind: 'tasks' }
  | { kind: 'agents' }
  | { kind: 'reports' }
  | { kind: 'knowledge' }
  | { kind: 'settings' }

interface UiState {
  view: View
  search: string
  logOpen: boolean
  /** 日志面板当前选中的标签 */
  logTab: { kind: 'run' | 'shell'; id: string } | null
  /** 任务页选中的单子 key */
  taskKey: string | null
  /** 智能体页选中的 multica issue id */
  issueId: string | null
  setView(view: View): void
  setSearch(search: string): void
  setLogOpen(open: boolean): void
  setLogTab(tab: { kind: 'run' | 'shell'; id: string } | null): void
  setTaskKey(key: string | null): void
  setIssueId(id: string | null): void
  /** 跳到智能体页并选中 issue */
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
}

export const useUi = create<UiState>((set) => ({
  view: { kind: 'overview' },
  search: '',
  logOpen: true,
  logTab: null,
  taskKey: null,
  issueId: null,
  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  setLogOpen: (logOpen) => set({ logOpen }),
  setLogTab: (logTab) => set({ logTab }),
  setTaskKey: (taskKey) => set({ taskKey }),
  setIssueId: (issueId) => set({ issueId }),
  openIssue: (issueId) => set({ view: { kind: 'agents' }, issueId }),
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
  clearReportDraft: () => set({ reportDraft: null })
}))
