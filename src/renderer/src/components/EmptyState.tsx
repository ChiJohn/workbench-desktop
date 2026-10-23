import { useUi } from '../stores/ui'

export function EmptyState({ message }: { message: string }) {
  const setView = useUi((s) => s.setView)
  return (
    <div className="page empty">
      <h1>还没有可用的项目</h1>
      <p className="hint">{message}</p>
      <button className="btn btn-primary" onClick={() => setView({ kind: 'settings' })}>
        去设置
      </button>
    </div>
  )
}
