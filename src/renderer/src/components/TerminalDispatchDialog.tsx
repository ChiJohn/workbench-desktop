import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Project, ReportWriter } from '../../../shared/types'
import { api, unwrap } from '../api'
import { qk } from '../queries'
import { useShells } from '../stores/shells'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { ensureTerminal, focusTerminal } from '../terminals'
import { WRITER_OPTIONS } from './ReportsPage'

const TERMINAL_AI_KEY = 'wb.terminalAiWriter'

function loadTerminalWriter(): ReportWriter {
  try {
    const saved = localStorage.getItem(TERMINAL_AI_KEY)
    return saved === 'codex' || saved === 'cursor' ? saved : 'claude'
  } catch {
    return 'claude'
  }
}

interface Props {
  tapdKey?: string
  initialTitle: string
  initialDescription?: string
  defaultProjectId?: string
  projects: Project[]
  onClose(): void
  onDispatched?(): void
}

export function TerminalDispatchDialog({
  tapdKey,
  initialTitle,
  initialDescription,
  defaultProjectId,
  projects,
  onClose,
  onDispatched
}: Props) {
  const qc = useQueryClient()
  const availableProjects = projects.filter((p) => p.available)
  const [writer, setWriter] = useState<ReportWriter>(loadTerminalWriter)
  const [projectId, setProjectId] = useState(
    () => availableProjects.find((p) => p.id === defaultProjectId)?.id ?? availableProjects[0]?.id ?? ''
  )
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [ensureCard, setEnsureCard] = useState(true)
  const [skipDesigns, setSkipDesigns] = useState<string[]>([])
  const [skipApis, setSkipApis] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const align = useQuery({
    queryKey: qk.align(tapdKey ?? ''),
    queryFn: () => unwrap(api.align.list(tapdKey as string)),
    enabled: Boolean(tapdKey)
  })
  const designs = align.data?.designs ?? []
  const apis = align.data?.apis ?? []
  const designCount = designs.filter((d) => !skipDesigns.includes(d.url)).length
  const apiCount = apis.filter((a) => !skipApis.includes(a.target)).length

  const toggle = (id: string, include: boolean, skipped: string[], setSkipped: (next: string[]) => void) => {
    setSkipped(include ? skipped.filter((x) => x !== id) : [...skipped, id])
  }

  const submit = async () => {
    if (!projectId || !title.trim() || busy) return
    setBusy(true)
    try {
      const res = await unwrap(
        api.tapd.dispatchTerminal({
          tapdKey,
          projectId,
          writer,
          title: title.trim(),
          description,
          ensureCard: tapdKey ? ensureCard : false,
          align: tapdKey ? { skipDesigns, skipApis } : undefined
        })
      )
      const session = await unwrap(api.shell.open(projectId, 120, 28))
      ensureTerminal(session.id, true)
      useShells.getState().upsert(session)
      useUi.getState().setLogTab({ kind: 'shell', id: session.id })
      useUi.getState().setLogOpen(true)
      await unwrap(api.shell.write(session.id, `${res.shellLine}\r`))
      setTimeout(() => focusTerminal(session.id), 50)

      if (tapdKey && res.card) {
        await qc.invalidateQueries({ queryKey: qk.tapdDetail(tapdKey) })
      }
      toast.success('已在底部终端启动 AI 处理任务', title.trim())
      onDispatched?.()
      onClose()
    } catch (e) {
      toast.error(e, '派给终端 AI 失败')
      setBusy(false)
    }
  }

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal form" onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
        <h2>派给终端 AI 处理</h2>
        <label>
          <span>终端 AI 工具</span>
          <select
            value={writer}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as ReportWriter
              setWriter(next)
              try {
                localStorage.setItem(TERMINAL_AI_KEY, next)
              } catch {
                // ignore
              }
            }}
          >
            {WRITER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>目标代码仓库</span>
          <select value={projectId} disabled={busy} onChange={(e) => setProjectId(e.target.value)}>
            {availableProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.repoPath}）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>任务标题</span>
          <input value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          <span>描述与实现要求</span>
          <textarea
            rows={5}
            value={description}
            disabled={busy}
            placeholder="补充任务背景、复现步骤、涉及页面或具体实现要求…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {tapdKey && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={ensureCard}
              disabled={busy}
              onChange={(e) => setEnsureCard(e.target.checked)}
            />
            同步生成/关联 Obsidian 任务卡，并指示 AI 完成后回填执行记录
          </label>
        )}
        {tapdKey && (designs.length > 0 || apis.length > 0) && (
          <details className="align-dispatch">
            <summary>
              设计稿 {designCount} 个、接口 {apiCount} 个将一并写入上下文
            </summary>
            {designs.map((d) => (
              <label key={d.url} className="checkbox">
                <input
                  type="checkbox"
                  checked={!skipDesigns.includes(d.url)}
                  onChange={(e) => toggle(d.url, e.target.checked, skipDesigns, setSkipDesigns)}
                />
                设计稿 · {d.name}
              </label>
            ))}
            {apis.map((a) => (
              <label key={a.target} className="checkbox">
                <input
                  type="checkbox"
                  checked={!skipApis.includes(a.target)}
                  onChange={(e) => toggle(a.target, e.target.checked, skipApis, setSkipApis)}
                />
                接口 · {a.title}
              </label>
            ))}
          </details>
        )}
        <p className="hint">
          将在所选仓库目录下打开底部交互式终端，并自动把需求描述、接口契约与 Vault 中的 UA 代码图谱线索传给{' '}
          {WRITER_OPTIONS.find((o) => o.value === writer)?.label}。
        </p>
        <div className="button-row">
          <button
            autoFocus
            className="btn btn-primary"
            type="button"
            disabled={busy || !projectId || !title.trim() || (Boolean(tapdKey) && align.isPending)}
            onClick={() => void submit()}
          >
            {busy ? '正在启动终端…' : '在终端启动 AI'}
          </button>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
