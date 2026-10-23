import { create } from 'zustand'

export type View = { kind: 'overview' } | { kind: 'project'; id: string } | { kind: 'tasks' } | { kind: 'settings' }

interface UiState {
  view: View
  search: string
  logOpen: boolean
  /** 任务页选中的单子 key */
  taskKey: string | null
  setView(view: View): void
  setSearch(search: string): void
  setLogOpen(open: boolean): void
  setTaskKey(key: string | null): void
}

export const useUi = create<UiState>((set) => ({
  view: { kind: 'overview' },
  search: '',
  logOpen: true,
  taskKey: null,
  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  setLogOpen: (logOpen) => set({ logOpen }),
  setTaskKey: (taskKey) => set({ taskKey })
}))
