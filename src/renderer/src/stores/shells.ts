import { create } from 'zustand'
import type { ShellSession } from '../../../shared/types'

interface ShellsState {
  sessions: Record<string, ShellSession>
  order: string[]
  upsert(session: ShellSession): void
  markExited(id: string, exitCode: number | null): void
  remove(id: string): void
}

export const useShells = create<ShellsState>((set, get) => ({
  sessions: {},
  order: [],
  upsert: (session) => {
    const { sessions, order } = get()
    const prev = sessions[session.id]
    set({
      sessions: { ...sessions, [session.id]: prev?.status === 'exited' ? prev : session },
      order: order.includes(session.id) ? order : [...order, session.id]
    })
  },
  markExited: (id, exitCode) => {
    const session = get().sessions[id]
    if (!session) return
    set({ sessions: { ...get().sessions, [id]: { ...session, status: 'exited', exitCode } } })
  },
  remove: (id) => {
    const { sessions, order } = get()
    const rest = { ...sessions }
    delete rest[id]
    set({ sessions: rest, order: order.filter((item) => item !== id) })
  }
}))
