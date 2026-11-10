import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { Project } from '../../../shared/types'
import { moveToolbarItem, normalizeToolbarOrder, type ToolbarId } from '../../../shared/toolbarOrder'
import { toolbarActive, type WorkspaceId } from '../../../shared/workspaceNav'
import { qk, useFetchAll } from '../queries'
import { useUi } from '../stores/ui'

const STORAGE_KEY = 'wb.toolbarOrder'

interface Props {
  projects: Project[]
  taskCount?: number
  /** 审核中的 multica 任务数 */
  reviewCount?: number
}

function loadOrder(): ToolbarId[] {
  try {
    return normalizeToolbarOrder(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return normalizeToolbarOrder(null)
  }
}

export function Toolbar({ projects, taskCount, reviewCount }: Props) {
  const qc = useQueryClient()
  const projectId = useUi((s) => s.projectId)
  const workspace = useUi((s) => s.workspace)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const toggleWorkspace = useUi((s) => s.toggleWorkspace)
  const showOverview = useUi((s) => s.showOverview)
  const toggleSettings = useUi((s) => s.toggleSettings)
  const fetchAll = useFetchAll(projects)
  const [order, setOrder] = useState<ToolbarId[]>(loadOrder)
  const [dragging, setDragging] = useState<ToolbarId | null>(null)
  const skipClick = useRef(false)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.registry })
    qc.invalidateQueries({ queryKey: qk.status })
  }

  const save = (next: ToolbarId[]) => {
    setOrder(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const onDragStart = (id: ToolbarId) => (event: React.DragEvent) => {
    skipClick.current = true
    event.dataTransfer.setData('text/plain', id)
    event.dataTransfer.effectAllowed = 'move'
    setDragging(id)
  }

  const onDragEnd = () => {
    setDragging(null)
    setTimeout(() => {
      skipClick.current = false
    }, 0)
  }

  const click = (run: () => void) => () => {
    if (skipClick.current) return
    run()
  }

  const onDragOver = (id: ToolbarId) => (event: React.DragEvent) => {
    event.preventDefault()
    const from = dragging ?? (event.dataTransfer.getData('text/plain') as ToolbarId)
    if (!from || from === id) return
    const next = moveToolbarItem(order, from, id)
    if (next !== order) save(next)
  }

  const nav = { projectId, workspace, settingsOpen }
  const navClass = (id: 'overview' | 'settings' | WorkspaceId) =>
    toolbarActive(nav, id) ? 'btn btn-ghost active' : 'btn btn-ghost'

  const button = (id: ToolbarId) => {
    const drag = {
      draggable: true,
      'data-tool': id,
      className: dragging === id ? 'dragging' : undefined,
      onDragStart: onDragStart(id),
      onDragOver: onDragOver(id),
      onDragEnd: onDragEnd
    }
    if (id === 'overview') return <button key={id} {...drag} className={`${navClass('overview')}${dragging === id ? ' dragging' : ''}`} onClick={click(showOverview)}>总览</button>
    if (id === 'tasks') {
      return (
        <button key={id} {...drag} className={`${navClass('tasks')}${dragging === id ? ' dragging' : ''}`} onClick={click(() => toggleWorkspace('tasks'))}>
          任务
          {taskCount !== undefined && taskCount > 0 && <span className="count-badge">{taskCount}</span>}
        </button>
      )
    }
    if (id === 'agents') {
      return (
        <button key={id} {...drag} className={`${navClass('agents')}${dragging === id ? ' dragging' : ''}`} onClick={click(() => toggleWorkspace('agents'))}>
          智能体
          {reviewCount !== undefined && reviewCount > 0 && (
            <span className="count-badge" title="审核中">
              {reviewCount}
            </span>
          )}
        </button>
      )
    }
    if (id === 'reports') return <button key={id} {...drag} className={`${navClass('reports')}${dragging === id ? ' dragging' : ''}`} onClick={click(() => toggleWorkspace('reports'))}>汇报</button>
    if (id === 'knowledge') return <button key={id} {...drag} className={`${navClass('knowledge')}${dragging === id ? ' dragging' : ''}`} onClick={click(() => toggleWorkspace('knowledge'))}>知识</button>
    if (id === 'bookmarks') return <button key={id} {...drag} className={`${navClass('bookmarks')}${dragging === id ? ' dragging' : ''}`} onClick={click(() => toggleWorkspace('bookmarks'))}>收藏</button>
    if (id === 'fetch') {
      return (
        <button key={id} {...drag} className={`btn${dragging === id ? ' dragging' : ''}`} disabled={fetchAll.isPending} onClick={click(() => fetchAll.mutate())}>
          {fetchAll.isPending ? '正在 fetch…' : '全部 fetch'}
        </button>
      )
    }
    if (id === 'refresh') return <button key={id} {...drag} className={`btn${dragging === id ? ' dragging' : ''}`} onClick={click(refresh)}>刷新</button>
    return (
      <button key={id} {...drag} className={`${navClass('settings')}${dragging === id ? ' dragging' : ''}`} onClick={click(toggleSettings)}>
        设置
      </button>
    )
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.7" />
            <rect x="9" y="2.5" width="4.5" height="4.5" rx="0.7" />
            <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.7" />
            <rect x="9" y="9" width="4.5" height="4.5" rx="0.7" />
          </svg>
        </span>
        Workbench
      </div>
      <nav className="toolbar-actions">
        {order.map((id) =>
          id === 'gap' ? <div key={id} className="toolbar-gap" data-tool="gap" onDragOver={onDragOver('gap')} /> : button(id)
        )}
        <button
          type="button"
          className="btn btn-ghost cmdk-trigger"
          title="全局搜索与命令面板（Ctrl+P）"
          onClick={() => useUi.getState().setCommandOpen(true)}
        >
          搜索
          <span className="cmdk-kbd mono">Ctrl+P</span>
        </button>
      </nav>
    </header>
  )
}
