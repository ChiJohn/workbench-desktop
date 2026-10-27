export interface Point {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

export const FAB_SIZE = 40
export const FAB_MARGIN = 8
export const FAB_GAP = 8

/** 把按钮限制在视口内，留出边距 */
export function clampFab(x: number, y: number, viewport: Size, size = FAB_SIZE, margin = FAB_MARGIN): Point {
  const maxX = Math.max(margin, viewport.w - margin - size)
  const maxY = Math.max(margin, viewport.h - margin - size)
  return {
    x: Math.min(Math.max(x, margin), maxX),
    y: Math.min(Math.max(y, margin), maxY)
  }
}

/**
 * 面板优先出现在按钮上方，并对齐按钮右缘。
 * 上方放不下就改到下方，贴边时再收回视口。
 */
export function placePanel(fab: Point, panel: Size, viewport: Size, fabSize = FAB_SIZE, margin = FAB_MARGIN, gap = FAB_GAP): Point {
  const maxLeft = Math.max(margin, viewport.w - margin - panel.w)
  const maxTop = Math.max(margin, viewport.h - margin - panel.h)
  const left = Math.min(Math.max(fab.x + fabSize - panel.w, margin), maxLeft)
  const above = fab.y - gap - panel.h
  const below = fab.y + fabSize + gap
  const top = Math.min(Math.max(above >= margin ? above : below, margin), maxTop)
  return { x: left, y: top }
}
