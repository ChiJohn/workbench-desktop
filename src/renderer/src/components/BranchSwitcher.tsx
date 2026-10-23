import { useEffect, useRef, useState } from 'react'
import { useBranches, useGitAction } from '../queries'

interface Props {
  projectId: string
  projectName: string
  branch: string | null
}

export function BranchSwitcher({ projectId, projectName, branch }: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const branches = useBranches(projectId, open)
  const action = useGitAction()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const list = (branches.data?.local ?? []).filter((b) => b.toLowerCase().includes(filter.trim().toLowerCase()))

  const choose = (name: string) => {
    setOpen(false)
    setFilter('')
    if (name === branch) return
    if (!window.confirm(`确认切换分支？\n\n项目：${projectName}\n${branch ?? '(detached)'}  →  ${name}`)) return
    action.mutate({ kind: 'checkout', id: projectId, branch: name })
  }

  return (
    <div className="branch-switcher" ref={ref}>
      <button className="btn mono" disabled={action.isPending} onClick={() => setOpen(!open)}>
        {action.isPending ? '切换中…' : (branch ?? '(detached)')} ▾
      </button>
      {open && (
        <div className="dropdown">
          <input autoFocus placeholder="过滤分支" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="dropdown-list">
            {branches.isLoading && <div className="hint">加载中…</div>}
            {branches.error && <div className="error-text">{branches.error.message}</div>}
            {list.map((name) => (
              <button
                key={name}
                className={`dropdown-item mono${name === branch ? ' active' : ''}`}
                onClick={() => choose(name)}
              >
                {name}
              </button>
            ))}
            {branches.data && list.length === 0 && <div className="hint">没有匹配的分支</div>}
          </div>
        </div>
      )}
    </div>
  )
}
