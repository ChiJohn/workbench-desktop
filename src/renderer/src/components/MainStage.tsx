import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { StatusMap } from '../../../shared/ipc'
import type { CnbSummaryItem, MulticaOverview, Prefs, Project, RegistryResult, TapdBoard, TapdStatus } from '../../../shared/types'
import {
  DEFAULT_WORKSPACE_SPLIT,
  WORKSPACE_LABELS,
  WORKSPACE_SPLIT_KEY,
  clampWorkspaceSplit,
  loadWorkspaceSplit,
  workspaceCompact,
  workspaceOverlay,
  type WorkspaceId
} from '../../../shared/workspaceNav'
import { useUi } from '../stores/ui'
import { AgentsPage } from './AgentsPage'
import { BookmarksPage } from './BookmarksPage'
import { EmptyState } from './EmptyState'
import { KnowledgePage } from './KnowledgePage'
import { Overview } from './Overview'
import { ProjectDetail } from './ProjectDetail'
import { ReportsPage } from './ReportsPage'
import { Settings } from './Settings'
import { TasksPage } from './TasksPage'

interface Props {
  projects: Project[]
  registry?: RegistryResult
  registryLoading: boolean
  registryFetching: boolean
  registryError: Error | null
  prefs?: Prefs
  status?: StatusMap
  tapdStatus?: TapdStatus
  apifoxStatus?: TapdStatus
  cnbStatus?: TapdStatus
  board: UseQueryResult<TapdBoard>
  multica: UseQueryResult<MulticaOverview>
  builds?: CnbSummaryItem[]
  statusLoading: boolean
}

export function MainStage({
  projects,
  registry,
  registryLoading,
  registryFetching,
  registryError,
  prefs,
  status,
  tapdStatus,
  apifoxStatus,
  cnbStatus,
  board,
  multica,
  builds,
  statusLoading
}: Props) {
  const projectId = useUi((s) => s.projectId)
  const workspace = useUi((s) => s.workspace)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const closeWorkspace = useUi((s) => s.closeWorkspace)
  const mainRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const [mainWidth, setMainWidth] = useState(1200)
  const [paneWidth, setPaneWidth] = useState(800)
  const [split, setSplit] = useState(() => {
    try {
      return loadWorkspaceSplit(localStorage.getItem(WORKSPACE_SPLIT_KEY))
    } catch {
      return DEFAULT_WORKSPACE_SPLIT
    }
  })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const measure = () => setMainWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return
      const ui = useUi.getState()
      if (ui.commandOpen || ui.settingsOpen || !ui.workspace) return
      if (document.querySelector('.modal-mask')) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"], .sticky-panel, .assistant-panel')
      ) {
        return
      }
      ui.escapeWorkspace()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!projectId || registryLoading || registryFetching) return
    if (!projects.some((project) => project.id === projectId)) useUi.getState().clearProject()
  }, [projectId, projects, registryLoading, registryFetching])

  useEffect(() => {
    const el = paneRef.current
    if (!el || !workspace) return
    const measure = () => setPaneWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [workspace, mainWidth, projectId])

  const project = projectId ? projects.find((item) => item.id === projectId) : undefined
  const overlay = Boolean(workspace && projectId && workspaceOverlay(mainWidth))
  const splitLayout = Boolean(workspace && projectId && !overlay)
  const compact = workspace ? workspaceCompact(paneWidth, overlay) : false
  const repoStatus = project ? status?.[project.id] : undefined
  const branch = repoStatus?.ok ? repoStatus.data.branch : undefined

  const onSplitDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage) return
    event.preventDefault()
    setDragging(true)
    const move = (ev: PointerEvent) => {
      const rect = stage.getBoundingClientRect()
      const next = clampWorkspaceSplit(rect.width > 0 ? (ev.clientX - rect.left) / rect.width : split)
      setSplit(next)
      try {
        localStorage.setItem(WORKSPACE_SPLIT_KEY, String(next))
      } catch {
        // ignore
      }
    }
    const up = () => {
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const stageStyle: CSSProperties | undefined = splitLayout
    ? { gridTemplateColumns: `minmax(300px, ${split}fr) 6px minmax(280px, ${1 - split}fr)` }
    : undefined

  return (
    <main className="main" ref={mainRef}>
      {settingsOpen && (
        <div className="settings-layer">
          <Settings
            prefs={prefs}
            registry={registry}
            registryError={registryError}
            tapdStatus={tapdStatus}
            apifoxStatus={apifoxStatus}
            cnbStatus={cnbStatus}
            board={board.data}
          />
        </div>
      )}
      <div
        ref={stageRef}
        className={`main-stage${overlay ? ' overlay' : ''}`}
        style={stageStyle}
        inert={settingsOpen || undefined}
      >
        {projectId && (
          <div className="project-pane" inert={overlay || undefined}>
            {project ? (
              <ProjectDetail project={project} status={status} prefs={prefs} />
            ) : (
              <div className="page hint">读取项目…</div>
            )}
          </div>
        )}
        {splitLayout && (
          <div
            className={`workspace-split${dragging ? ' dragging' : ''}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="调整项目与工作区宽度"
            onPointerDown={onSplitDown}
          />
        )}
        {workspace && (
          <div className="workspace-pane" ref={paneRef}>
            <div className="workspace-bar">
              {overlay && project && (
                <button type="button" className="workspace-project" onClick={closeWorkspace}>
                  {project.name}
                  {branch ? <span className="muted"> · {branch}</span> : null}
                </button>
              )}
              <span className="workspace-title">{WORKSPACE_LABELS[workspace]}</span>
              <span className="spacer" />
              <button type="button" className="btn btn-small btn-ghost" onClick={closeWorkspace}>
                关闭
              </button>
            </div>
            <WorkspacePage
              id={workspace}
              compact={compact}
              projects={projects}
              prefs={prefs}
              tapdStatus={tapdStatus}
              board={board}
              multica={multica}
            />
          </div>
        )}
        {!projectId && !workspace && (
          <div className="stage-base">
            {registryLoading ? (
              <div className="page hint">读取项目列表…</div>
            ) : registryError ? (
              <EmptyState message={`${registryError.message}。可以在「设置」里用「初始化 vault」建一个新库`} />
            ) : projects.length === 0 ? (
              <EmptyState
                message="还没有项目。点「新增项目」登记本机目录，或从远程仓库克隆"
                actionLabel="新增项目"
                onAction={() => useUi.getState().openProjectEditor({ mode: 'add' })}
              />
            ) : (
              <Overview projects={projects} status={status} builds={builds} loading={statusLoading} />
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function WorkspacePage({
  id,
  compact,
  projects,
  prefs,
  tapdStatus,
  board,
  multica
}: {
  id: WorkspaceId
  compact: boolean
  projects: Project[]
  prefs?: Prefs
  tapdStatus?: TapdStatus
  board: UseQueryResult<TapdBoard>
  multica: UseQueryResult<MulticaOverview>
}) {
  if (id === 'tasks') return <TasksPage status={tapdStatus} board={board} projects={projects} prefs={prefs} compact={compact} />
  if (id === 'agents') return <AgentsPage overview={multica} projects={projects} compact={compact} />
  if (id === 'reports') return <ReportsPage prefs={prefs} />
  if (id === 'knowledge') return <KnowledgePage projects={projects} />
  return <BookmarksPage links={prefs?.quickLinks} />
}
