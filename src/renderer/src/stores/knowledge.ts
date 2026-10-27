import { create } from 'zustand'
import type { KnowledgeAnswer, KnowledgeAskRequest } from '../../../shared/types'
import { api, ApiError, unwrap } from '../api'
import { toast } from './toast'

interface KnowledgeState {
  running: { startedAt: number; progress: string } | null
  answer: KnowledgeAnswer | null
  setProgress(text: string): void
  ask(req: KnowledgeAskRequest): Promise<void>
  cancel(): Promise<void>
}

export const useKnowledge = create<KnowledgeState>((set, get) => ({
  running: null,
  answer: null,
  setProgress: (progress) => {
    const running = get().running
    if (running) set({ running: { ...running, progress } })
  },
  ask: async (req) => {
    set({ running: { startedAt: Date.now(), progress: '正在检索笔记…' }, answer: null })
    try {
      const answer = await unwrap(api.knowledge.ask(req))
      set({ answer })
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'REPORT_CANCELLED')) toast.error(e, '提问失败')
    } finally {
      set({ running: null })
    }
  },
  cancel: async () => {
    await unwrap(api.knowledge.cancel()).catch(() => undefined)
  }
}))
