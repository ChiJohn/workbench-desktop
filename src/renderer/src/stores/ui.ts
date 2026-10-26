import { create } from 'zustand'

export type View =
  | { kind: 'overview' }
  | { kind: 'project'; id: string }
  | { kind: 'tasks' }
  | { kind: 'agents' }
  | { kind: 'reports' }
  | { kind: 'settings' }

interface UiState {
  view: View
  search: string
  logOpen: boolean
  /** 任务页选中的单子 key */
  taskKey: string | null
  /** 智能体页选中的 multica issue id */
  issueId: string | null
  setView(view: View): void
  setSearch(search: string): void
  setLogOpen(open: boolean): void
  setTaskKey(key: string | null): void
  setIssueId(id: string | null): void
  /** 跳到智能体页并选中 issue */
  openIssue(id: string): void
}

export const useUi = create<UiState>((set) => ({
  view: { kind: 'overview' },
  search: '',
  logOpen: true,
  taskKey: null,
  issueId: null,
  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  setLogOpen: (logOpen) => set({ logOpen }),
  setTaskKey: (taskKey) => set({ taskKey }),
  setIssueId: (issueId) => set({ issueId }),
  openIssue: (issueId) => set({ view: { kind: 'agents' }, issueId })
}))
