import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UA_PLUGIN_INSTALL_CMD } from '../../../core/ua/viewerUrl'
import type { InboxItem, KnowledgeSearchGroup, Project } from '../../../shared/types'
import { api, unwrap } from '../api'
import { localTime } from '../format'
import { qk } from '../queries'
import { useKnowledge } from '../stores/knowledge'
import { useShells } from '../stores/shells'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { ensureTerminal } from '../terminals'

function VaultUaSection() {
  const qc = useQueryClient()
  const [opening, setOpening] = useState(false)
  const [stopping, setStopping] = useState(false)
  const status = useQuery({
    queryKey: qk.uaVault,
    queryFn: () => unwrap(api.ua.vaultStatus()),
    retry: false
  })
  const summary = status.data?.summary ?? null
  const viewerUrl = status.data?.viewerUrl ?? null
  const plugin = status.data?.plugin
  const pluginInstalled = Boolean(plugin?.installed)
  const knowledgeCmd = plugin?.claudeKnowledgeCmd ?? '/understand-anything:understand-knowledge .'

  const open = async () => {
    setOpening(true)
    try {
      const { url } = await unwrap(api.ua.openVaultDashboard())
      toast.success('已在浏览器打开知识图谱看板', url)
      await qc.invalidateQueries({ queryKey: qk.uaVault })
    } catch (e) {
      toast.error(e, '打开知识图谱看板失败')
    } finally {
      setOpening(false)
    }
  }

  const stop = async () => {
    setStopping(true)
    try {
      await unwrap(api.ua.stopVaultDashboard())
      toast.success('已停止知识图谱看板')
      await qc.invalidateQueries({ queryKey: qk.uaVault })
    } catch (e) {
      toast.error(e, '停止看板失败')
    } finally {
      setStopping(false)
    }
  }

  const sendToShell = async (line: string, tip: string) => {
    try {
      const session = await unwrap(api.shell.open('__vault__', 120, 24))
      ensureTerminal(session.id, true)
      useShells.getState().upsert(session)
      useUi.getState().setLogTab({ kind: 'shell', id: session.id })
      useUi.getState().setLogOpen(true)
      await unwrap(api.shell.write(session.id, `${line}\r`))
      toast.success(tip)
    } catch (e) {
      toast.error(e, '启动终端失败')
    }
  }

  const installPluginInTerminal = () =>
    sendToShell(UA_PLUGIN_INSTALL_CMD, '已在底部终端安装 UA 插件，完成后点卡片「刷新」即可生成知识图谱')

  const runInTerminal = () => sendToShell(`claude "${knowledgeCmd}"`, '已在底部终端启动知识库图谱构建')

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(knowledgeCmd)
      toast.success(`已复制 ${knowledgeCmd}`)
    } catch (e) {
      toast.error(e, '复制失败')
    }
  }

  return (
    <section className="card">
      <div className="page-header">
        <h2>知识图谱（Understand Anything）</h2>
        {viewerUrl && (
          <span className="task-status st-done" title={viewerUrl}>
            看板运行中
          </span>
        )}
        {status.data && !pluginInstalled && (
          <span className="task-status st-todo" title="Claude Code 尚未安装 understand-anything 插件">
            未装 Claude 插件
          </span>
        )}
        <div className="header-actions">
          <button
            className="btn btn-small"
            type="button"
            disabled={status.isFetching}
            onClick={() => void qc.invalidateQueries({ queryKey: qk.uaVault })}
          >
            {status.isFetching ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>
      {status.isPending && <p className="hint">检查知识库图谱…</p>}
      {status.isError && <p className="error-text">{status.error.message}</p>}
      {status.data?.hasGraph ? (
        <>
          <p className="hint">
            已找到 <span className="mono">{status.data.graphRel}</span>
            {summary && (
              <>
                {' · '}节点 {summary.nodeCount} · 关联边 {summary.edgeCount}
                {summary.layerCount > 0 ? ` · 聚类 ${summary.layerCount}` : ''}
              </>
            )}
            {summary?.analyzedAt && <>（{localTime(summary.analyzedAt)}）</>}
          </p>
          <div className="button-row">
            <button className="btn btn-primary" type="button" disabled={opening} onClick={() => void open()}>
              {opening ? '启动中…' : viewerUrl ? '重新打开看板' : '打开知识图谱看板'}
            </button>
            {viewerUrl && (
              <button className="btn" type="button" disabled={stopping} onClick={() => void stop()}>
                {stopping ? '停止中…' : '停止看板'}
              </button>
            )}
            {pluginInstalled ? (
              <button className="btn" type="button" onClick={() => void runInTerminal()}>
                在终端更新图谱
              </button>
            ) : (
              <button className="btn" type="button" onClick={() => void installPluginInTerminal()}>
                安装 UA 插件
              </button>
            )}
            <button className="btn btn-ghost" type="button" onClick={() => void copyCmd()}>
              复制命令
            </button>
          </div>
        </>
      ) : status.data ? (
        <>
          <p className="hint">
            {pluginInstalled ? (
              <>
                通过 <span className="mono">{knowledgeCmd}</span> 抽取 Obsidian Vault 中的双链、实体、论点与隐含关联，生成可交互聚类的知识图谱看板。
              </>
            ) : (
              <>
                检测到本机 Claude Code 尚未安装 <span className="mono">understand-anything</span> 插件。请先点「在终端安装 UA
                插件」，安装完成后点右上角「刷新」即可生成 Vault 知识图谱。
              </>
            )}
          </p>
          <div className="button-row">
            {pluginInstalled ? (
              <button className="btn btn-primary" type="button" onClick={() => void runInTerminal()}>
                在终端生成知识图谱
              </button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => void installPluginInTerminal()}>
                在终端安装 UA 插件
              </button>
            )}
            <button className="btn btn-ghost" type="button" onClick={() => void copyCmd()}>
              复制命令
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.round((now - since) / 1000))
  return <span className="mono">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>
}

function openNote(path: string) {
  void unwrap(api.tapd.openCard(path)).catch((e) => toast.error(e, '打开失败'))
}

export function KnowledgePage({ projects }: { projects: Project[] }) {
  const running = useKnowledge((s) => s.running)
  const answer = useKnowledge((s) => s.answer)
  const ask = useKnowledge((s) => s.ask)
  const cancel = useKnowledge((s) => s.cancel)
  const [scope, setScope] = useState('')
  const [question, setQuestion] = useState('')
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<KnowledgeSearchGroup[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [noteProject, setNoteProject] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [over, setOver] = useState(false)
  const [inboxBusy, setInboxBusy] = useState(false)
  const [inbox, setInbox] = useState<InboxItem[]>([])

  const takeFiles = async (files: File[]) => {
    const paths = files.map((file) => api.app.pathForFile(file)).filter(Boolean)
    if (!paths.length) {
      toast.error(new Error('没有拿到文件路径'), '收件失败')
      return
    }
    setInboxBusy(true)
    try {
      const items = await unwrap(api.knowledge.ingest(paths))
      setInbox((prev) => [...items, ...prev])
      const saved = items.filter((item) => item.notePath)
      if (saved.length) toast.success(`已收进 ${saved.length} 个`, saved.map((item) => item.notePath).join('、'))
      const failed = items.filter((item) => item.error)
      if (failed.length) toast.failure(failed.map((item) => `${item.name}：${item.error}`).join('\n'))
    } catch (e) {
      toast.error(e, '收件失败')
    }
    setInboxBusy(false)
  }

  const pasteClipboard = async () => {
    if (inboxBusy) return
    setInboxBusy(true)
    try {
      const item = await unwrap(api.knowledge.ingestClipboard())
      setInbox((prev) => [item, ...prev])
      toast.success(`已收进：${item.category} · ${item.title}`, item.notePath)
    } catch (e) {
      toast.error(e, '剪贴板收件失败')
    }
    setInboxBusy(false)
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (inboxBusy) return
      const dt = event.clipboardData
      if (!dt) return
      const fileList = [...dt.files]
      const paths = fileList.map((f) => api.app.pathForFile(f)).filter(Boolean)
      if (paths.length > 0) {
        event.preventDefault()
        void takeFiles(fileList)
        return
      }
      const hasImage = [...dt.items].some((i) => i.type.startsWith('image/'))
      if (hasImage) {
        event.preventDefault()
        void pasteClipboard()
        return
      }
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      if (!typing) {
        event.preventDefault()
        void pasteClipboard()
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const save = async (kind: 'knowledge' | 'qa', extra?: { question?: string; sources?: string[] }) => {
    setSaving(true)
    try {
      const rel = await unwrap(
        api.knowledge.save({
          kind,
          title: kind === 'qa' ? (extra?.question || question).slice(0, 40) : title,
          project: noteProject || undefined,
          body: kind === 'qa' ? answer?.answer || '' : body,
          sources: extra?.sources,
          question: extra?.question
        })
      )
      toast.success(kind === 'qa' ? '问答已保存' : '已写入知识库', rel)
    } catch (e) {
      toast.error(e, '保存失败')
    }
    setSaving(false)
  }

  const distill = async () => {
    setSaving(true)
    try {
      const draft = await unwrap(api.knowledge.draft({ title, material: body, project: noteProject }))
      if (draft.existing) toast.failure('这条已经沉淀过')
      else {
        if (draft.project) setNoteProject(draft.project)
        setTitle(draft.title)
        setBody(draft.body)
        toast.success('已整理，确认后再保存')
      }
    } catch (e) {
      toast.error(e, '整理失败')
    }
    setSaving(false)
  }

  const search = async () => {
    setSearching(true)
    try {
      setGroups(await unwrap(api.knowledge.search(query, scope || undefined)))
    } catch (e) {
      toast.error(e, '搜索失败')
    }
    setSearching(false)
  }

  return (
    <div className="page knowledge-page">
      <div className="page-header">
        <h1>知识</h1>
      </div>
      <section
        className={`card inbox-drop${over ? ' over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          if (!inboxBusy) void takeFiles([...event.dataTransfer.files])
        }}
      >
        <div className="page-header">
          <h2>收件</h2>
          <div className="header-actions">
            <button className="btn btn-small" type="button" disabled={inboxBusy} onClick={() => void pasteClipboard()}>
              {inboxBusy ? '识别归档中…' : '粘贴剪贴板（Ctrl+V）'}
            </button>
          </div>
        </div>
        <p>{inboxBusy ? '正在识别并归档，图片第一次会慢一些…' : '把图片或文件拖到这里，或直接按 Ctrl+V 粘贴截图/剪贴板文字。识别后按内容归类写进知识库。'}</p>
        {inbox.map((item) => (
          <div key={`${item.name}-${item.notePath || item.error}`} className="inbox-item">
            {item.error ? (
              <p className="hint">
                {item.name}：{item.error}
              </p>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={() => openNote(item.notePath)}>
                  {item.category} · {item.title}
                </button>
                {item.warning && <p className="hint">{item.warning}</p>}
              </>
            )}
          </div>
        ))}
      </section>
      <section className="card">
        <h2>问答</h2>
        <div className="knowledge-row">
          <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={Boolean(running)}>
            <option value="">全部</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <input value={question} placeholder="用一句话提问" disabled={Boolean(running)} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && question.trim() && !running && void ask({ question, project: scope || undefined })} />
          {running ? (
            <button className="btn" onClick={() => void cancel()}>
              取消
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!question.trim()} onClick={() => void ask({ question, project: scope || undefined })}>
              提问
            </button>
          )}
        </div>
        {running && (
          <p className="hint">
            <Elapsed since={running.startedAt} /> {running.progress}
          </p>
        )}
        {answer && (
          <>
            <pre className="knowledge-answer">{answer.answer}</pre>
            {answer.sources.length > 0 ? (
              <div className="knowledge-sources">
                {answer.sources.map((path) => (
                  <button key={path} className="btn btn-ghost" onClick={() => openNote(path)}>
                    {path}
                  </button>
                ))}
              </div>
            ) : (
              <p className="hint">未给出可核对的来源{answer.dropped > 0 ? `（${answer.dropped} 条路径不在 vault 里）` : ''}</p>
            )}
            <div className="button-row">
              <button className="btn" disabled={saving || !answer.answer.trim()} onClick={() => void save('qa', { question, sources: answer.sources })}>
                存成笔记
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>快速搜索</h2>
        <div className="knowledge-row">
          <input value={query} placeholder="关键词，用空格分开" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && query.trim() && !searching && void search()} />
          <button className="btn" disabled={searching || !query.trim()} onClick={() => void search()}>
            {searching ? '搜索中…' : '搜索'}
          </button>
        </div>
        {groups && groups.length === 0 && <p className="hint">没有结果</p>}
        {groups?.map((group) => (
          <div key={group.file} className="knowledge-hit">
            <button className="btn btn-ghost" onClick={() => openNote(group.file)}>
              {group.file}
            </button>
            {group.snippets.map((snippet) => (
              <p key={snippet} className="hint">
                {snippet}
              </p>
            ))}
          </div>
        ))}
      </section>

      <section className="card">
        <h2>速记</h2>
        <div className="knowledge-row">
          <select value={noteProject} onChange={(e) => setNoteProject(e.target.value)}>
            <option value="">不归属项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <input value={title} placeholder="标题" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <textarea className="knowledge-note" value={body} placeholder="写几条要点，或先随便记下来再整理" onChange={(e) => setBody(e.target.value)} />
        <div className="button-row">
          <button className="btn" disabled={saving || !body.trim()} onClick={() => void distill()}>
            {saving ? '处理中…' : '整理后再存'}
          </button>
          <button className="btn btn-primary" disabled={saving || !title.trim() || !body.trim()} onClick={() => void save('knowledge')}>
            直接保存
          </button>
        </div>
      </section>

      <VaultUaSection />
    </div>
  )
}
