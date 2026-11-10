import { useEffect, useRef, useState } from 'react'
import { useBranches, useGitAction } from '../queries'
import { toast } from '../stores/toast'

interface Props {
  projectId: string
  projectName: string
  branch: string | null
}

async function copyBranchName(name: string | null) {
  if (!name) return
  try {
    await navigator.clipboard.writeText(name)
    toast.success('已复制分支名', name)
  } catch (e) {
    toast.error(e, '复制分支名失败')
  }
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
      <button className="btn mono" type="button" disabled={action.isPending} onClick={() => setOpen(!open)}>
        {action.isPending ? '切换中…' : (branch ?? '(detached)')} ▾
      </button>
      {branch && (
        <button
          className="btn btn-small btn-ghost"
          type="button"
          title={`复制分支名：${branch}`}
          onClick={() => void copyBranchName(branch)}
        >
          复制
        </button>
      )}
      {open && (
        <div className="dropdown">
          <input autoFocus placeholder="过滤分支" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="dropdown-list">
            {branches.isLoading && <div className="hint">加载中…</div>}
            {branches.error && <div className="error-text">{branches.error.message}</div>}
            {list.map((name) => (
              <div key={name} className={`dropdown-item-row${name === branch ? ' active' : ''}`}>
                <button className="dropdown-item mono" type="button" onClick={() => choose(name)}>
                  {name}
                </button>
                <button
                  className="icon-btn branch-copy-btn"
                  type="button"
                  title={`复制 ${name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void copyBranchName(name)
                  }}
                >
                  ⧉
                </button>
              </div>
            ))}
            {branches.data && list.length === 0 && <div className="hint">没有匹配的分支</div>}
          </div>
        </div>
      )}
    </div>
  )
}
