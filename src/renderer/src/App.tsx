import { LogPanel } from './components/LogPanel'
import { MainStage } from './components/MainStage'
import { ProjectList } from './components/ProjectList'
import { ProjectDialog } from './components/ProjectDialog'
import { StickyNote } from './components/StickyNote'
import { AssistantDock } from './components/AssistantDock'
import { Toasts } from './components/Toasts'
import { Toolbar } from './components/Toolbar'
import { useApifoxStatus, useCnbStatus, useCnbSummary, useMulticaOverview, usePrefs, useRegistry, useStatusAll, useTapdBoard, useTapdStatus } from './queries'
import { DepositDialog } from './components/DepositDialog'
import { CommandPalette } from './components/CommandPalette'
import { VaultSearchDialog } from './components/VaultSearchDialog'
import { useUi } from './stores/ui'
import { useGlobalEvents } from './useGlobalEvents'

export function App() {
  useGlobalEvents()
  const logOpen = useUi((s) => s.logOpen)
  const logDock = useUi((s) => s.logDock)
  const registry = useRegistry()
  const prefs = usePrefs()
  const tapdStatus = useTapdStatus()
  const apifoxStatus = useApifoxStatus()
  const cnbStatus = useCnbStatus()
  const cnbSummary = useCnbSummary(Boolean(cnbStatus.data?.hasToken))
  const board = useTapdBoard(Boolean(tapdStatus.data?.hasToken))
  const projects = registry.data?.projects ?? []
  const status = useStatusAll(projects.length > 0)
  const multica = useMulticaOverview()
  const reviewCount = multica.data?.issues.filter((i) => i.status === 'in_review').length

  return (
    <div className={`app dock-${logDock}${logOpen ? ' log-open' : ''}`}>
      <Toolbar projects={projects} taskCount={board.data?.items.length} reviewCount={reviewCount} />
      <ProjectList projects={projects} status={status.data} prefs={prefs.data} />
      <MainStage
        projects={projects}
        registry={registry.data}
        registryLoading={registry.isLoading}
        registryFetching={registry.isFetching}
        registryError={registry.error}
        prefs={prefs.data}
        status={status.data}
        tapdStatus={tapdStatus.data}
        apifoxStatus={apifoxStatus.data}
        cnbStatus={cnbStatus.data}
        board={board}
        multica={multica}
        builds={cnbStatus.data?.hasToken ? cnbSummary.data : undefined}
        statusLoading={status.isFetching}
      />
      <LogPanel projects={projects} />
      <DepositDialog projects={projects} />
      <ProjectDialog projects={projects} codeRoot={prefs.data?.codeRoot} />
      <CommandPalette projects={projects} prefs={prefs.data} tapdItems={board.data?.items} />
      <VaultSearchDialog />
      <StickyNote prefs={prefs.data} />
      <AssistantDock />
      <Toasts />
    </div>
  )
}
