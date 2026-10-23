import { useState } from 'react'
import { useToasts, type Toast } from '../stores/toast'

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`toast ${toast.kind}`}>
      <div className="toast-head">
        <span className="toast-title">{toast.title}</span>
        {toast.detail && (
          <button className="icon-btn" onClick={() => setExpanded(!expanded)}>
            {expanded ? '收起' : '详情'}
          </button>
        )}
        <button className="icon-btn" onClick={() => dismiss(toast.id)}>
          ×
        </button>
      </div>
      {expanded && <pre className="toast-detail">{toast.detail}</pre>}
    </div>
  )
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
