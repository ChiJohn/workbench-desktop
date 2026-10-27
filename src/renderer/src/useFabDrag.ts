import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clampFab, placePanel, type Point } from '../../shared/fabPosition'

const DRAG_THRESHOLD = 4

function loadPoint(key: string): Point | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as { x?: unknown; y?: unknown } | null
    if (!raw || typeof raw.x !== 'number' || typeof raw.y !== 'number') return null
    return clampFab(raw.x, raw.y, { w: window.innerWidth, h: window.innerHeight })
  } catch {
    return null
  }
}

function savePoint(key: string, point: Point) {
  localStorage.setItem(key, JSON.stringify(point))
}

/**
 * 按住悬浮按钮拖动。移动超过几像素才算拖动，避免误触点击。
 * 没有拖过时返回空样式，继续用原来的右下角定位。
 */
export function useFabDrag(storageKey: string, open: boolean, layoutKey?: unknown) {
  const [pos, setPos] = useState<Point | null>(() => loadPoint(storageKey))
  const [panelPos, setPanelPos] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const fabRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const setPanel = useCallback((node: HTMLElement | null) => {
    panelRef.current = node
  }, [])
  const skipClick = useRef(false)
  const posRef = useRef(pos)
  posRef.current = pos

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight })
      setPos((current) => {
        if (!current) return current
        const next = clampFab(current.x, current.y, { w: window.innerWidth, h: window.innerHeight })
        if (next.x === current.x && next.y === current.y) return current
        savePoint(storageKey, next)
        return next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [storageKey])

  useLayoutEffect(() => {
    const fab = fabRef.current
    const panel = panelRef.current
    if (!open || !pos || !fab || !panel) {
      setPanelPos(null)
      return
    }
    const box = fab.getBoundingClientRect()
    const next = placePanel({ x: box.left, y: box.top }, { w: panel.offsetWidth, h: panel.offsetHeight }, { w: window.innerWidth, h: window.innerHeight })
    setPanelPos((current) => (current && current.x === next.x && current.y === next.y ? current : next))
  }, [open, pos, dragging, layoutKey, viewport])

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const origin = { x: rect.left, y: rect.top, px: event.clientX, py: event.clientY, pointerId: event.pointerId, moved: false }
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== origin.pointerId) return
      const dx = move.clientX - origin.px
      const dy = move.clientY - origin.py
      if (!origin.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      origin.moved = true
      setDragging(true)
      const next = clampFab(origin.x + dx, origin.y + dy, { w: window.innerWidth, h: window.innerHeight })
      posRef.current = next
      setPos(next)
    }
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== origin.pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragging(false)
      if (!origin.moved || !posRef.current) return
      savePoint(storageKey, posRef.current)
      skipClick.current = true
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onClick = (event: React.MouseEvent) => {
    if (!skipClick.current) return
    skipClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const placed = pos ? ({ left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } as const) : undefined
  const panelStyle = panelPos ? ({ left: panelPos.x, top: panelPos.y, right: 'auto', bottom: 'auto' } as const) : undefined

  return { fabRef, setPanel, dragging, fabStyle: placed, panelStyle, onPointerDown, onClick }
}
