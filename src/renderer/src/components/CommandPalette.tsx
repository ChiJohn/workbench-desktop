import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_QUICK_LINKS } from '../../../shared/quickLinks'
import type { Prefs, Project, TapdItem } from '../../../shared/types'
import { api, unwrap } from '../api'
import { TYPE_LABELS } from '../format'
import { openWith, startScript } from '../queries'
import { useRuns } from '../stores/runs'
import { useShells } from '../stores/shells'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { ensureTerminal } from '../terminals'
import { KIND_LABELS } from './TasksPage'

interface CommandEntry {
  id: string
  group: string
  title: string
  subtitle?: string
  hint?: string
  keywords: string
  run(ctrlKey?: boolean): void
}

interface Props {
  projects: Project[]
  prefs?: Prefs
  tapdItems?: TapdItem[]
}

export function CommandPalette({ projects, prefs, tapdItems }: Props) {
  const open = useUi((s) => s.commandOpen)
  const setOpen = useUi((s) => s.setCommandOpen)
  const setView = useUi((s) => s.setView)
  const view = useUi((s) => s.view)
  const sessions = useRuns((s) => s.sessions)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setOpen(!useUi.getState().commandOpen)
      } else if (e.key === 'Escape' && useUi.getState().commandOpen) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  const entries = useMemo<CommandEntry[]>(() => {
    const list: CommandEntry[] = []

    // 1. 项目（置顶优先）
    const sortedProjects = [
      ...projects.filter((p) => prefs?.repos[p.id]?.pinned),
      ...projects.filter((p) => !prefs?.repos[p.id]?.pinned)
    ]
    for (const p of sortedProjects) {
      const opener = prefs?.repos[p.id]?.defaultOpener ?? 'cursor'
      list.push({
        id: `proj:${p.id}`,
        group: '项目',
        title: `${prefs?.repos[p.id]?.pinned ? '★ ' : ''}${p.name}`,
        subtitle: `${TYPE_LABELS[p.type]} · ${p.repoPath}`,
        hint: 'Enter 详情 / Ctrl+Enter 打开',
        keywords: `${p.name} ${p.repoPath} ${TYPE_LABELS[p.type]} ${p.note}`.toLowerCase(),
        run: (ctrlKey) => {
          if (ctrlKey && p.available) void openWith(p.id, opener)
          else setView({ kind: 'project', id: p.id })
        }
      })
    }

    // 2. 运行中与常用脚本
    const runningSet = new Set<string>()
    for (const s of Object.values(sessions)) {
      if (s.status !== 'running') continue
      const proj = projects.find((p) => p.id === s.projectId)
      const pName = proj?.name ?? s.projectId
      runningSet.add(`${s.projectId}::${s.script}`)
      list.push({
        id: `run:${s.runId}`,
        group: '运行中脚本',
        title: `▶ ${pName} : ${s.script}`,
        subtitle: '点击查看底部运行日志',
        hint: '查看日志',
        keywords: `script 脚本 运行 ${pName} ${s.script}`.toLowerCase(),
        run: () => {
          useRuns.getState().setActive(s.runId)
          useUi.getState().setLogTab({ kind: 'run', id: s.runId })
          useUi.getState().setLogOpen(true)
        }
      })
    }

    for (const p of sortedProjects) {
      if (!p.available) continue
      const favs = prefs?.repos[p.id]?.favoriteScripts ?? []
      for (const script of favs) {
        if (runningSet.has(`${p.id}::${script}`)) continue
        list.push({
          id: `fav:${p.id}:${script}`,
          group: '常用脚本',
          title: `★ ${p.name} : ${script}`,
          subtitle: p.repoPath,
          hint: '启动脚本',
          keywords: `script 脚本 常用 ${p.name} ${script}`.toLowerCase(),
          run: () => void startScript(p.id, script)
        })
      }
    }

    // 3. 页面与动作
    const navs: { id: string; title: string; kw: string; act: () => void }[] = [
      { id: 'nav:overview', title: '前往：总览', kw: 'overview 总览 首页', act: () => setView({ kind: 'overview' }) },
      { id: 'nav:tasks', title: '前往：任务中心（TAPD）', kw: 'tasks tapd 任务 需求 缺陷', act: () => setView({ kind: 'tasks' }) },
      { id: 'nav:agents', title: '前往：智能体（Multica）', kw: 'agents multica 智能体 审核', act: () => setView({ kind: 'agents' }) },
      { id: 'nav:reports', title: '前往：汇报（日报 / 周报 / 月报）', kw: 'reports 汇报 日报 周报 月报', act: () => setView({ kind: 'reports' }) },
      { id: 'nav:knowledge', title: '前往：知识与收件箱', kw: 'knowledge 知识 问答 搜索 收件 图谱', act: () => setView({ kind: 'knowledge' }) },
      { id: 'nav:bookmarks', title: '前往：收藏书签', kw: 'bookmarks 收藏 书签 链接', act: () => setView({ kind: 'bookmarks' }) },
      { id: 'nav:settings', title: '前往：设置', kw: 'settings 设置 配置', act: () => setView({ kind: 'settings' }) },
      {
        id: 'act:new-project',
        title: '动作：新增或克隆项目',
        kw: 'add clone 新增 克隆 项目',
        act: () => useUi.getState().openProjectEditor({ mode: 'add' })
      },
      {
        id: 'act:new-shell',
        title: '动作：打开底部终端',
        kw: 'terminal shell 终端 命令行',
        act: async () => {
          const targetProjectId = view.kind === 'project' ? view.id : null
          try {
            const session = await unwrap(api.shell.open(targetProjectId, 120, 24))
            ensureTerminal(session.id, true)
            useShells.getState().upsert(session)
            useUi.getState().setLogTab({ kind: 'shell', id: session.id })
            useUi.getState().setLogOpen(true)
          } catch (e) {
            toast.error(e, '打开终端失败')
          }
        }
      }
    ]
    for (const n of navs) {
      list.push({
        id: n.id,
        group: '导航与动作',
        title: n.title,
        keywords: `${n.title} ${n.kw}`.toLowerCase(),
        run: () => void n.act()
      })
    }

    // 4. 收藏书签
    const links = prefs?.quickLinks ?? DEFAULT_QUICK_LINKS
    for (const link of links) {
      list.push({
        id: `link:${link.url}`,
        group: '收藏链接',
        title: `${link.name} ↗`,
        subtitle: link.url,
        hint: '打开网页',
        keywords: `bookmark 书签 链接 ${link.name} ${link.url}`.toLowerCase(),
        run: () => void api.app.openExternal(link.url)
      })
    }

    // 5. TAPD 单子
    for (const item of tapdItems ?? []) {
      list.push({
        id: `tapd:${item.key}`,
        group: 'TAPD 任务',
        title: `[${KIND_LABELS[item.kind]}] ${item.title}`,
        subtitle: `${item.workspaceName} · ${item.statusLabel}`,
        hint: '查看单子',
        keywords: `tapd ${KIND_LABELS[item.kind]} ${item.id} ${item.title} ${item.workspaceName} ${item.statusLabel}`.toLowerCase(),
        run: () => {
          useUi.getState().setTaskKey(item.key)
          setView({ kind: 'tasks' })
        }
      })
    }

    return list
  }, [projects, prefs, tapdItems, sessions, setView, view])

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return entries.slice(0, 40)
    return entries.filter((entry) => terms.every((t) => entry.keywords.includes(t))).slice(0, 50)
  }, [entries, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const activeEl = container.querySelector<HTMLElement>('[data-active="true"]')
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  const execute = (entry: CommandEntry | undefined, ctrlKey?: boolean) => {
    if (!entry) return
    setOpen(false)
    entry.run(ctrlKey)
  }

  return (
    <div className="modal-mask cmdk-mask" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmdk-dialog">
        <div className="cmdk-input-wrap">
          <input
            autoFocus
            className="cmdk-input"
            value={query}
            placeholder="搜索项目、常用脚本、TAPD 单子、收藏链接或页面…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                execute(filtered[activeIndex], e.ctrlKey || e.metaKey)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
              }
            }}
          />
          <span className="cmdk-kbd mono">ESC</span>
        </div>
        <div ref={listRef} className="cmdk-list">
          {filtered.length === 0 ? (
            <div className="cmdk-empty muted">没有匹配的结果</div>
          ) : (
            filtered.map((item, idx) => {
              const prevGroup = idx > 0 ? filtered[idx - 1].group : null
              const active = idx === activeIndex
              return (
                <div key={item.id}>
                  {item.group !== prevGroup && <div className="cmdk-group">{item.group}</div>}
                  <div
                    data-active={active}
                    className={`cmdk-item${active ? ' active' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={(e) => execute(item, e.ctrlKey || e.metaKey)}
                  >
                    <div className="cmdk-item-main">
                      <span className="cmdk-item-title">{item.title}</span>
                      {item.subtitle && <span className="cmdk-item-sub muted">{item.subtitle}</span>}
                    </div>
                    {item.hint && <span className="cmdk-item-hint muted">{item.hint}</span>}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
