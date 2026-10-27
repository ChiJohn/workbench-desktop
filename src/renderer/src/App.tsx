import { AgentsPage } from './components/AgentsPage'
import { EmptyState } from './components/EmptyState'
import { LogPanel } from './components/LogPanel'
import { Overview } from './components/Overview'
import { ProjectDetail } from './components/ProjectDetail'
import { ProjectList } from './components/ProjectList'
import { ProjectDialog } from './components/ProjectDialog'
import { KnowledgePage } from './components/KnowledgePage'
import { ReportsPage } from './components/ReportsPage'
import { Settings } from './components/Settings'
import { TasksPage } from './components/TasksPage'
import { StickyNote } from './components/StickyNote'
import { AssistantDock } from './components/AssistantDock'
import { Toasts } from './components/Toasts'
import { Toolbar } from './components/Toolbar'
import { useApifoxStatus, useMulticaOverview, usePrefs, useRegistry, useStatusAll, useTapdBoard, useTapdStatus } from './queries'
import { DepositDialog } from './components/DepositDialog'
import { useUi } from './stores/ui'
import { useGlobalEvents } from './useGlobalEvents'

export function App() {
  useGlobalEvents()
  const view = useUi((s) => s.view)
  const registry = useRegistry()
  const prefs = usePrefs()
  const tapdStatus = useTapdStatus()
  const apifoxStatus = useApifoxStatus()
  const board = useTapdBoard(Boolean(tapdStatus.data?.hasToken))
  const projects = registry.data?.projects ?? []
  const status = useStatusAll(projects.length > 0)
  const multica = useMulticaOverview()
  const reviewCount = multica.data?.issues.filter((i) => i.status === 'in_review').length

  const renderMain = () => {
    if (view.kind === 'settings') {
      return (
        <Settings
          prefs={prefs.data}
          registry={registry.data}
          registryError={registry.error}
          tapdStatus={tapdStatus.data}
          apifoxStatus={apifoxStatus.data}
          board={board.data}
        />
      )
    }
    if (view.kind === 'tasks') {
      return <TasksPage status={tapdStatus.data} board={board} projects={projects} prefs={prefs.data} />
    }
    if (view.kind === 'agents') return <AgentsPage overview={multica} projects={projects} />
    if (view.kind === 'reports') return <ReportsPage prefs={prefs.data} />
    if (view.kind === 'knowledge') return <KnowledgePage projects={projects} />
    if (registry.isLoading) return <div className="page hint">读取项目列表…</div>
    if (registry.error) return <EmptyState message={`${registry.error.message}。可以在「设置」里用「初始化 vault」建一个新库`} />
    if (projects.length === 0) {
      return (
        <EmptyState
          message="还没有项目。点「新增项目」登记本机目录，或从远程仓库克隆"
          actionLabel="新增项目"
          onAction={() => useUi.getState().openProjectEditor({ mode: 'add' })}
        />
      )
    }
    if (view.kind === 'project') {
      const project = projects.find((p) => p.id === view.id)
      if (project) return <ProjectDetail project={project} status={status.data} prefs={prefs.data} />
    }
    return <Overview projects={projects} status={status.data} loading={status.isFetching} />
  }

  return (
    <div className="app">
      <Toolbar projects={projects} taskCount={board.data?.items.length} reviewCount={reviewCount} />
      <ProjectList projects={projects} status={status.data} prefs={prefs.data} />
      <main className="main">{renderMain()}</main>
      <LogPanel projects={projects} />
      <DepositDialog projects={projects} />
      <ProjectDialog projects={projects} codeRoot={prefs.data?.codeRoot} />
      <StickyNote prefs={prefs.data} />
      <AssistantDock />
      <Toasts />
    </div>
  )
}
