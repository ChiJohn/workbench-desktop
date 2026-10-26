import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import type { Prefs, RegistryResult, TapdBoard, TapdStatus } from '../../../shared/types'
import { api, unwrap } from '../api'
import { qk, refreshTapdBoard, useSavePrefs } from '../queries'
import { toast } from '../stores/toast'
import { MulticaSettings } from './MulticaSettings'
import { ReportSettings } from './ReportSettings'

interface Props {
  prefs?: Prefs
  registry?: RegistryResult
  registryError?: Error | null
  tapdStatus?: TapdStatus
  board?: TapdBoard
}

function TapdSettings({ status, board, disabled }: { status?: TapdStatus; board?: TapdBoard; disabled: string[] }) {
  const qc = useQueryClient()
  const save = useSavePrefs()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  const applyToken = async (value: string | null) => {
    setBusy(true)
    try {
      qc.setQueryData(qk.tapdStatus, await unwrap(api.tapd.setToken(value)))
      setToken('')
      toast.success(value ? 'TAPD 令牌已保存' : 'TAPD 令牌已清除')
      if (value) await refreshTapdBoard(qc, true)
      else qc.removeQueries({ queryKey: qk.tapdBoard })
    } catch (e) {
      toast.error(e, '保存令牌失败')
    }
    setBusy(false)
  }

  const toggleWorkspace = (id: string, enabled: boolean) => {
    const next = enabled ? disabled.filter((d) => d !== id) : [...disabled, id]
    save.mutate({ tapd: { disabledWorkspaces: next } }, { onSuccess: () => refreshTapdBoard(qc, false) })
  }

  return (
    <section className="card form">
      <h2>TAPD</h2>
      <p>
        令牌：{status?.hasToken ? '已配置' : '未配置'}
        {status?.source && <span className="muted">（{status.source}）</span>}
      </p>
      <label>
        <span>{status?.hasToken ? '替换令牌' : '访问令牌'}</span>
        <input
          className="mono"
          type="password"
          autoComplete="off"
          placeholder="TAPD 个人访问令牌"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <small>用系统加密存储，只在主进程使用；清除后不会再从 ~/.cursor/mcp.json 自动导入</small>
      </label>
      <div className="button-row">
        <button className="btn btn-primary" type="button" disabled={busy || !token.trim()} onClick={() => applyToken(token.trim())}>
          保存令牌
        </button>
        {status?.hasToken && (
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => applyToken(null)}>
            清除
          </button>
        )}
      </div>
      {board && (
        <>
          <h3>参与的项目</h3>
          <div className="checkbox-list">
            {board.workspaces.map((w) => (
              <label key={w.id} className="checkbox">
                <input type="checkbox" checked={w.enabled} disabled={save.isPending} onChange={(e) => toggleWorkspace(w.id, e.target.checked)} />
                {w.name}
              </label>
            ))}
          </div>
          <small className="hint">取消勾选的项目不拉取、不通知</small>
        </>
      )}
    </section>
  )
}

export function Settings({ prefs, registry, registryError, tapdStatus, board }: Props) {
  const save = useSavePrefs()
  const [form, setForm] = useState<Prefs | null>(prefs ?? null)

  useEffect(() => {
    if (prefs && !form) setForm(prefs)
  }, [prefs, form])

  if (!form) return <div className="page hint">加载设置…</div>

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setForm({ ...form, [key]: value })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(
      {
        vaultPath: form.vaultPath.trim(),
        hotkey: form.hotkey.trim(),
        terminal: form.terminal,
        wechatDevtoolsCli: form.wechatDevtoolsCli?.trim() || undefined,
        wechatDevtoolsToken: form.wechatDevtoolsToken?.trim() || undefined
      },
      { onSuccess: () => toast.success('设置已保存') }
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>设置</h1>
      </div>
      <form className="card form" onSubmit={submit}>
        <label>
          <span>Obsidian vault 路径</span>
          <input className="mono" value={form.vaultPath} onChange={(e) => set('vaultPath', e.target.value)} />
          <small>从 vault 的 Projects/仓库映射.md 读取项目列表</small>
        </label>
        <label>
          <span>全局快捷键</span>
          <input className="mono" value={form.hotkey} onChange={(e) => set('hotkey', e.target.value)} />
          <small>Electron 快捷键格式，例如 CommandOrControl+Alt+W</small>
        </label>
        <label>
          <span>终端</span>
          <select value={form.terminal} onChange={(e) => set('terminal', e.target.value as Prefs['terminal'])}>
            <option value="wt">Windows Terminal</option>
            <option value="powershell">PowerShell</option>
          </select>
        </label>
        <label>
          <span>微信开发者工具 cli.bat</span>
          <input
            className="mono"
            placeholder="例如 D:\Program Files\微信web开发者工具\cli.bat"
            value={form.wechatDevtoolsCli ?? ''}
            onChange={(e) => set('wechatDevtoolsCli', e.target.value)}
          />
          <small>预览 / 上传前需要在开发者工具「设置 → 安全设置」中开启服务端口，并保持登录</small>
        </label>
        <label>
          <span>开发者工具 CLI 令牌（可选）</span>
          <input
            className="mono"
            type="password"
            autoComplete="off"
            value={form.wechatDevtoolsToken ?? ''}
            onChange={(e) => set('wechatDevtoolsToken', e.target.value)}
          />
          <small>安全设置中开启了 CLI 访问令牌时填写，通过环境变量传给 cli.bat</small>
        </label>
        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={save.isPending}>
            {save.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </form>

      <TapdSettings status={tapdStatus} board={board} disabled={prefs?.tapd?.disabledWorkspaces ?? []} />

      <MulticaSettings prefs={prefs?.multica ?? {}} projects={registry?.projects ?? []} />

      <ReportSettings prefs={prefs?.report ?? {}} />

      <section className="card">
        <h2>仓库映射</h2>
        {registryError ? (
          <p className="error-text">{registryError.message}</p>
        ) : registry ? (
          <>
            <p className="mono hint">{registry.sourcePath}</p>
            <p>
              已解析 {registry.projects.length} 个项目，其中 {registry.projects.filter((p) => !p.available).length}{' '}
              个不可用。
            </p>
            {registry.skipped.length > 0 && (
              <table className="table compact">
                <thead>
                  <tr>
                    <th>行号</th>
                    <th>原因</th>
                    <th>内容</th>
                  </tr>
                </thead>
                <tbody>
                  {registry.skipped.map((s) => (
                    <tr key={`${s.line}-${s.reason}`}>
                      <td className="num">{s.line}</td>
                      <td>{s.reason}</td>
                      <td className="mono ellipsis" title={s.raw}>
                        {s.raw}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p className="hint">加载中…</p>
        )}
      </section>
    </div>
  )
}
