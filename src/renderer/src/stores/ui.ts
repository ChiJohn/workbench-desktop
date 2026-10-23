import { create } from 'zustand'

export type View = { kind: 'overview' } | { kind: 'project'; id: string } | { kind: 'settings' }

interface UiState {
  view: View
  search: string
  logOpen: boolean
  setView(view: View): void
  setSearch(search: string): void
  setLogOpen(open: boolean): void
}

export const useUi = create<UiState>((set) => ({
  view: { kind: 'overview' },
  search: '',
  logOpen: true,
  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  setLogOpen: (logOpen) => set({ logOpen })
}))
