import { create } from 'zustand'
import { ApiError } from '../api'

export interface Toast {
  id: number
  kind: 'error' | 'success'
  title: string
  detail?: string
}

interface ToastState {
  toasts: Toast[]
  push(t: Omit<Toast, 'id'>): void
  dismiss(id: number): void
}

let nextId = 1

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++
    set({ toasts: [...get().toasts, { ...t, id }] })
    // 带详情的错误需要用户展开阅读，不自动消失
    if (t.kind === 'success') setTimeout(() => get().dismiss(id), 3_000)
    else if (!t.detail) setTimeout(() => get().dismiss(id), 10_000)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}))

export const toast = {
  success(title: string, detail?: string) {
    useToasts.getState().push({ kind: 'success', title, detail })
  },
  failure(title: string, detail?: string) {
    useToasts.getState().push({ kind: 'error', title, detail })
  },
  error(e: unknown, prefix?: string) {
    const title = e instanceof Error ? e.message : String(e)
    const detail = e instanceof ApiError ? e.detail : undefined
    useToasts.getState().push({ kind: 'error', title: prefix ? `${prefix}：${title}` : title, detail })
  }
}
