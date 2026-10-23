import { useEffect, useState, type FormEvent } from 'react'
import type { Prefs, RegistryResult } from '../../../shared/types'
import { useSavePrefs } from '../queries'
import { toast } from '../stores/toast'

interface Props {
  prefs?: Prefs
  registry?: RegistryResult
  registryError?: Error | null
}

export function Settings({ prefs, registry, registryError }: Props) {
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
        wechatDevtoolsCli: form.wechatDevtoolsCli?.trim() || undefined
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
            placeholder="例如 C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat"
            value={form.wechatDevtoolsCli ?? ''}
            onChange={(e) => set('wechatDevtoolsCli', e.target.value)}
          />
        </label>
        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={save.isPending}>
            {save.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </form>

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
