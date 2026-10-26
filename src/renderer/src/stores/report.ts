import { create } from 'zustand'
import { noteKey, periodOf } from '../../../shared/reportPeriod'
import type { ReportGenerateRequest, ReportKind, ReportRange } from '../../../shared/types'
import { api, ApiError, unwrap } from '../api'
import { toast } from './toast'

const currentRanges = (now = new Date()): Record<ReportKind, ReportRange> => ({
  daily: periodOf('daily', now),
  weekly: periodOf('weekly', now),
  monthly: periodOf('monthly', now)
})

interface ReportState {
  kind: ReportKind
  ranges: Record<ReportKind, ReportRange>
  /** 取消勾选的素材 id */
  excluded: Record<string, true>
  /** noteKey → 草稿 */
  drafts: Record<string, string>
  generating: { key: string; startedAt: number; progress: string } | null
  setKind(kind: ReportKind): void
  /** 切换类型并回到本期 */
  open(kind: ReportKind): void
  setRange(range: ReportRange): void
  setExcluded(ids: string[], excluded: boolean): void
  setDraft(key: string, text: string): void
  setProgress(text: string): void
  generate(req: ReportGenerateRequest): Promise<void>
}

export const useReport = create<ReportState>((set, get) => ({
  kind: 'weekly',
  ranges: currentRanges(),
  excluded: {},
  drafts: {},
  generating: null,
  setKind: (kind) => set({ kind }),
  open: (kind) => set({ kind, ranges: { ...get().ranges, [kind]: periodOf(kind, new Date()) } }),
  setRange: (range) => set({ ranges: { ...get().ranges, [get().kind]: range } }),
  setExcluded: (ids, excluded) => {
    const next = { ...get().excluded }
    for (const id of ids) {
      if (excluded) next[id] = true
      else delete next[id]
    }
    set({ excluded: next })
  },
  setDraft: (key, text) => set({ drafts: { ...get().drafts, [key]: text } }),
  setProgress: (progress) => {
    const g = get().generating
    if (g) set({ generating: { ...g, progress } })
  },
  generate: async (req) => {
    const key = noteKey(req.kind, req.range)
    set({ generating: { key, startedAt: Date.now(), progress: '准备素材…' } })
    try {
      const text = await unwrap(api.report.generate(req))
      set({ drafts: { ...get().drafts, [key]: text } })
      toast.success('草稿已生成，确认后再保存')
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'REPORT_CANCELLED')) toast.error(e, '生成失败')
    } finally {
      set({ generating: null })
    }
  }
}))
