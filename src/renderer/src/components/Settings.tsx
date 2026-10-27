import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import type { Prefs, QuickLink, RegistryResult, TapdBoard, TapdStatus } from '../../../shared/types'
import { DEFAULT_QUICK_LINKS } from '../../../shared/quickLinks'
import { api, unwrap } from '../api'
import { qk, refreshTapdBoard, useSavePrefs } from '../queries'
import { toast } from '../stores/toast'
import { MulticaSettings } from './MulticaSettings'
import { KnowledgeSettings } from './KnowledgeSettings'
import { ReportSettings } from './ReportSettings'

interface Props {
  prefs?: Prefs
  registry?: RegistryResult
  registryError?: Error | null
  tapdStatus?: TapdStatus
  apifoxStatus?: TapdStatus
  cnbStatus?: TapdStatus
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

function ApifoxSettings({ status }: { status?: TapdStatus }) {
  const qc = useQueryClient()
  const [token, setToken] = useState('')
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)

  const applyToken = async (value: string | null) => {
    setBusy(true)
    try {
      qc.setQueryData(qk.apifoxStatus, await unwrap(api.apifox.setToken(value)))
      setToken('')
      toast.success(value ? 'Apifox 令牌已保存' : 'Apifox 令牌已清除')
    } catch (e) {
      toast.error(e, '保存令牌失败')
    }
    setBusy(false)
  }

  const copySnippet = async () => {
    setBusy(true)
    try {
      const text = await unwrap(api.align.mcpSnippet(projectId))
      await navigator.clipboard.writeText(text)
      toast.success('已复制 MCP 配置', '请自己设置环境变量 APIFOX_ACCESS_TOKEN，再粘贴到 Cursor 的 mcp.json')
    } catch (e) {
      toast.error(e, '复制失败')
    }
    setBusy(false)
  }

  return (
    <section className="card form">
      <h2>Apifox</h2>
      <p>令牌：{status?.hasToken ? '已配置' : '未配置'}</p>
      <label>
        <span>{status?.hasToken ? '替换令牌' : '访问令牌'}</span>
        <input
          className="mono"
          type="password"
          autoComplete="off"
          placeholder="Apifox 开放 API 访问令牌"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <small>用系统加密存储，只在主进程拉取接口契约时使用</small>
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
      <label>
        <span>生成 Cursor MCP 配置</span>
        <input className="mono" placeholder="Apifox 项目号" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
        <small>片段不含令牌。请自己设置 APIFOX_ACCESS_TOKEN，再粘贴到 Cursor 的 mcp.json。工作台不会改那个文件。</small>
      </label>
      <div className="button-row">
        <button className="btn" type="button" disabled={busy || !projectId.trim()} onClick={copySnippet}>
          复制配置
        </button>
      </div>
    </section>
  )
}

function QuickLinkSettings({ links }: { links?: QuickLink[] }) {
  const save = useSavePrefs()
  const [rows, setRows] = useState<QuickLink[] | null>(null)
  const value = rows ?? links ?? DEFAULT_QUICK_LINKS

  const setRow = (index: number, patch: Partial<QuickLink>) =>
    setRows(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const submit = () => {
    const quickLinks = value.map((r) => ({ name: r.name.trim(), url: r.url.trim() })).filter((r) => r.name && r.url)
    save.mutate(
      { quickLinks },
      {
        onSuccess: () => {
          setRows(null)
          toast.success('快速入口已保存')
        }
      }
    )
  }

  return (
    <section className="card form">
      <h2>快速入口</h2>
      {value.map((row, i) => (
        <div key={i} className="knowledge-row">
          <input className="quick-link-name" placeholder="名称" value={row.name} onChange={(e) => setRow(i, { name: e.target.value })} />
          <input className="mono" placeholder="https://…" value={row.url} onChange={(e) => setRow(i, { url: e.target.value })} />
          <button className="btn btn-small" type="button" onClick={() => setRows(value.filter((_, x) => x !== i))}>
            删除
          </button>
        </div>
      ))}
      <div className="button-row">
        <button className="btn btn-small" type="button" onClick={() => setRows([...value, { name: '', url: '' }])}>
          添加一行
        </button>
        {links === undefined && rows === null && (
          <button className="btn btn-small btn-ghost" type="button" onClick={() => setRows(DEFAULT_QUICK_LINKS)}>
            编辑默认列表
          </button>
        )}
        <span className="spacer" />
        <button className="btn btn-primary btn-small" type="button" disabled={save.isPending || rows === null} onClick={submit}>
          {save.isPending ? '保存中…' : '保存'}
        </button>
      </div>
      <small className="hint">显示在侧栏底部，点击用系统浏览器打开。名称或地址留空的行会被忽略。</small>
    </section>
  )
}

function CnbSettings({ status }: { status?: TapdStatus }) {
  const qc = useQueryClient()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  const applyToken = async (value: string | null) => {
    setBusy(true)
    try {
      qc.setQueryData(qk.cnbStatus, await unwrap(api.cnb.setToken(value)))
      qc.invalidateQueries({ queryKey: qk.cnbSummary })
      setToken('')
      toast.success(value ? 'CNB 令牌已保存' : 'CNB 令牌已清除')
    } catch (e) {
      toast.error(e, '保存令牌失败')
    }
    setBusy(false)
  }

  return (
    <section className="card form">
      <h2>CNB</h2>
      <p>令牌：{status?.hasToken ? '已配置' : '未配置'}</p>
      <label>
        <span>{status?.hasToken ? '替换令牌' : '访问令牌'}</span>
        <input
          className="mono"
          type="password"
          autoComplete="off"
          placeholder="CNB 个人访问令牌"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <small>读取记录需要构建历史只读权限。触发构建还需要 repo-cnb-trigger:rw。按钮来自 origin 上的 .cnb/web_trigger.yml，只启用当前分支匹配的项。令牌加密保存，只在主进程使用</small>
      </label>
      <div className="button-row">
        <button className="btn btn-primary" disabled={busy || !token.trim()} onClick={() => void applyToken(token)}>
          保存令牌
        </button>
        {status?.hasToken && (
          <button className="btn" disabled={busy} onClick={() => void applyToken(null)}>
            清除
          </button>
        )}
      </div>
    </section>
  )
}

export function Settings({ prefs, registry, registryError, tapdStatus, apifoxStatus, cnbStatus, board }: Props) {
  const qc = useQueryClient()
  const save = useSavePrefs()
  const [form, setForm] = useState<Prefs | null>(prefs ?? null)
  const [initing, setIniting] = useState(false)

  useEffect(() => {
    if (prefs && !form) setForm(prefs)
  }, [prefs, form])

  if (!form) return <div className="page hint">加载设置…</div>

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setForm({ ...form, [key]: value })

  const pick = async () => {
    try {
      const path = await unwrap(api.app.pickFolder(form.vaultPath))
      if (path) set('vaultPath', path)
    } catch (e) {
      toast.error(e, '选择文件夹失败')
    }
  }

  const pickRoot = async () => {
    try {
      const path = await unwrap(api.app.pickFolder(form.codeRoot))
      if (path) set('codeRoot', path)
    } catch (e) {
      toast.error(e, '选择文件夹失败')
    }
  }

  const init = async () => {
    const path = form.vaultPath.trim()
    if (!window.confirm(`在 ${path} 初始化 vault？\n会创建工作台需要的目录和文件，已有文件不会被覆盖，并把 vault 路径切到这里。`)) return
    setIniting(true)
    try {
      const r = await unwrap(api.vault.init(path))
      qc.setQueryData(qk.prefs, { ...form, vaultPath: r.path })
      setForm({ ...form, vaultPath: r.path })
      await qc.invalidateQueries({ queryKey: qk.prefs })
      toast.success(
        r.created.length ? `已初始化，新建 ${r.created.length} 项` : '目录都已存在，没有新建',
        [r.created.length ? `新建：${r.created.join('、')}` : '', r.skipped.length ? `已存在：${r.skipped.join('、')}` : ''].filter(Boolean).join('\n')
      )
    } catch (e) {
      toast.error(e, '初始化失败')
    }
    setIniting(false)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(
      {
        vaultPath: form.vaultPath.trim(),
        codeRoot: form.codeRoot?.trim() ?? '',
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
          <div className="knowledge-row">
            <input className="mono" value={form.vaultPath} onChange={(e) => set('vaultPath', e.target.value)} />
            <button className="btn" type="button" disabled={initing} onClick={() => void pick()}>
              选择…
            </button>
            <button className="btn" type="button" disabled={initing || !form.vaultPath.trim()} onClick={() => void init()}>
              {initing ? '初始化中…' : '初始化 vault'}
            </button>
          </div>
          <small>从 vault 的项目.md 读取项目列表。「初始化 vault」会建好工作台需要的目录、项目.md 和汇报模板，已有文件不会被覆盖</small>
        </label>
        <label>
          <span>代码根目录</span>
          <div className="knowledge-row">
            <input
              className="mono"
              value={form.codeRoot ?? ''}
              placeholder="D:\job\code"
              onChange={(e) => set('codeRoot', e.target.value)}
            />
            <button className="btn" type="button" onClick={() => void pickRoot()}>
              选择…
            </button>
          </div>
          <small>克隆远程仓库时，默认放在这个目录下。本机有 D:\job\code 时会自动用它</small>
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

      <ApifoxSettings status={apifoxStatus} />

      <CnbSettings status={cnbStatus} />

      <MulticaSettings prefs={prefs?.multica ?? {}} projects={registry?.projects ?? []} />

      <ReportSettings prefs={prefs?.report ?? {}} />

      <KnowledgeSettings prefs={prefs?.knowledge ?? {}} />

      <QuickLinkSettings links={prefs?.quickLinks} />

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
