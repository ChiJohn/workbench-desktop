/** TAPD 状态文案 → 胶囊色调 */
export type StatusTone = 'todo' | 'doing' | 'done'

export function statusTone(label: string): StatusTone {
  if (label.includes('未完成')) return 'todo'
  if (/完成|解决|关闭|已验收/.test(label)) return 'done'
  if (/进行|研发|修复|实现|测试|验收/.test(label)) return 'doing'
  return 'todo'
}
