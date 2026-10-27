import type { Project, ProjectType, RepoStatus, Result } from '../../shared/types'

export const TYPE_LABELS: Record<ProjectType, string> = {
  miniapp: '小程序',
  h5: 'H5',
  admin: '后台',
  pc: 'PC',
  cli: 'CLI',
  other: '其他'
}

export const TYPE_ORDER: ProjectType[] = ['miniapp', 'h5', 'admin', 'pc', 'cli', 'other']

export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)} 天前`
  const d = new Date(timestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type Health = 'clean' | 'dirty' | 'alert' | 'unavailable' | 'unknown'

export const HEALTH_LABELS: Record<Health, string> = {
  clean: '干净',
  dirty: '有未提交改动',
  alert: '落后远程或出错',
  unavailable: '不可用',
  unknown: '状态加载中'
}

export function healthOf(project: Project, status?: Result<RepoStatus>): Health {
  if (!project.available) return 'unavailable'
  if (!status) return 'unknown'
  if (!status.ok || status.data.behind > 0) return 'alert'
  if (status.data.changes > 0) return 'dirty'
  return 'clean'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export function clockTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** ISO 时间转本地 `MM-DD HH:mm`；full 时为 `YYYY-MM-DD HH:mm:ss` */
export function localTime(iso: string, full = false): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  return full ? `${d.getFullYear()}-${date}:${p(d.getSeconds())}` : date
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

/** TAPD 状态文案 → 胶囊色调 */
export { statusTone } from '../../core/tapd/statusTone'
export type { StatusTone } from '../../core/tapd/statusTone'
