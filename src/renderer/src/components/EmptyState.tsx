import { useUi } from '../stores/ui'

export function EmptyState({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const setView = useUi((s) => s.setView)
  return (
    <div className="page empty">
      <h1>还没有可用的项目</h1>
      <p className="hint">{message}</p>
      <div className="button-row">
        {onAction && (
          <button className="btn btn-primary" onClick={onAction}>
            {actionLabel}
          </button>
        )}
        <button className="btn" onClick={() => setView({ kind: 'settings' })}>
          去设置
        </button>
      </div>
    </div>
  )
}
