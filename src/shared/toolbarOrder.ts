export const TOOLBAR_IDS = ['overview', 'tasks', 'agents', 'reports', 'knowledge', 'gap', 'fetch', 'refresh', 'settings'] as const

export type ToolbarId = (typeof TOOLBAR_IDS)[number]

const KNOWN = new Set<string>(TOOLBAR_IDS)

/** 丢掉不认识的 id，补上缺失的，间隙只留一个 */
export function normalizeToolbarOrder(saved: unknown): ToolbarId[] {
  const next: ToolbarId[] = []
  const seen = new Set<ToolbarId>()
  if (Array.isArray(saved)) {
    for (const id of saved) {
      if (typeof id !== 'string' || !KNOWN.has(id) || seen.has(id as ToolbarId)) continue
      seen.add(id as ToolbarId)
      next.push(id as ToolbarId)
    }
  }
  for (const id of TOOLBAR_IDS) if (!seen.has(id)) next.push(id)
  return next
}

/** 把 from 放到 to 当前的位置。间隙本身不能被拖走。 */
export function moveToolbarItem(order: ToolbarId[], from: ToolbarId, to: ToolbarId): ToolbarId[] {
  if (from === 'gap' || from === to) return order
  const fromIndex = order.indexOf(from)
  const toIndex = order.indexOf(to)
  if (fromIndex < 0 || toIndex < 0) return order
  const next = order.slice()
  next.splice(fromIndex, 1)
  next.splice(toIndex, 0, from)
  return next
}
