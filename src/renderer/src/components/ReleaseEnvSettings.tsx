import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReleaseEnv, ReleaseEnvOverride } from '../../../shared/types'
import { qk, useSavePrefs } from '../queries'
import { toast } from '../stores/toast'

interface Props {
  projectId: string
  envs: ReleaseEnv[]
  onClose(): void
}

export function ReleaseEnvSettings({ projectId, envs, onClose }: Props) {
  const qc = useQueryClient()
  const save = useSavePrefs()
  const [rows, setRows] = useState(() =>
    envs.map((e) => ({ script: e.script, label: e.label === e.script ? '' : e.label, hidden: e.hidden }))
  )

  if (envs.length === 0) return <p className="hint">package.json 中没有 build:weapp 开头的脚本。</p>

  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const submit = () => {
    const releaseEnvs: Record<string, ReleaseEnvOverride> = {}
    for (const r of rows) {
      const label = r.label.trim()
      if (label || r.hidden) releaseEnvs[r.script] = { ...(label && { label }), ...(r.hidden && { hidden: true }) }
    }
    save.mutate(
      { repos: { [projectId]: { releaseEnvs } } },
      {
        onSuccess: async () => {
          await qc.invalidateQueries({ queryKey: qk.releaseInfo(projectId) })
          toast.success('环境设置已保存')
          onClose()
        }
      }
    )
  }

  return (
    <div className="release-envs">
      <table className="table compact">
        <thead>
          <tr>
            <th>脚本</th>
            <th>别名</th>
            <th>隐藏</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.script}>
              <td className="mono">{r.script}</td>
              <td>
                <input placeholder="例如 测试 / 生产" value={r.label} onChange={(e) => update(i, { label: e.target.value })} />
              </td>
              <td>
                <input type="checkbox" checked={r.hidden} onChange={(e) => update(i, { hidden: e.target.checked })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="button-row">
        <button className="btn btn-primary btn-small" disabled={save.isPending} onClick={submit}>
          保存
        </button>
        <button className="btn btn-ghost btn-small" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  )
}
