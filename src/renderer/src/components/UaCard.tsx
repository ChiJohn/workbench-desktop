import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isUaGraphStale, UA_PLUGIN_INSTALL_CMD } from '../../../core/ua/viewerUrl'
import { api, unwrap } from '../api'
import { localTime } from '../format'
import { openWith, qk } from '../queries'
import { useShells } from '../stores/shells'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'
import { ensureTerminal } from '../terminals'
import { CollapsibleCard } from './CollapsibleCard'

const UA_REPO = 'https://github.com/Egonex-AI/Understand-Anything'
const CURSOR_UA_COMMAND = '/understand --language zh'

interface Props {
  projectId: string
  available: boolean
  headCommit?: string | null
}

export function UaCard({ projectId, available, headCommit }: Props) {
  const qc = useQueryClient()
  const [opening, setOpening] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const status = useQuery({
    queryKey: qk.uaGraph(projectId),
    queryFn: () => unwrap(api.ua.graphStatus(projectId)),
    enabled: available,
    retry: false
  })

  if (!available) return null

  const summary = status.data?.summary ?? null
  const viewerUrl = status.data?.viewerUrl ?? null
  const plugin = status.data?.plugin
  const pluginInstalled = Boolean(plugin?.installed)
  const hasRepoResidue = Boolean(status.data?.hasRepoResidue)
  const inVault = status.data?.location === 'vault'
  const stale = isUaGraphStale(summary?.gitCommitHash, headCommit)
  const shortGraphCommit = summary?.gitCommitHash ? summary.gitCommitHash.slice(0, 7) : null

  const open = async () => {
    setOpening(true)
    try {
      const { url } = await unwrap(api.ua.openDashboard(projectId))
      toast.success('已在浏览器打开 UA 看板', url)
      await qc.invalidateQueries({ queryKey: qk.uaGraph(projectId) })
    } catch (e) {
      toast.error(e, '打开 UA 看板失败')
    } finally {
      setOpening(false)
    }
  }

  const stop = async () => {
    setStopping(true)
    try {
      await unwrap(api.ua.stopDashboard(projectId))
      toast.success('已停止 UA 看板')
      await qc.invalidateQueries({ queryKey: qk.uaGraph(projectId) })
    } catch (e) {
      toast.error(e, '停止 UA 看板失败')
    } finally {
      setStopping(false)
    }
  }

  const syncToVault = async () => {
    setSyncing(true)
    try {
      const res = await unwrap(api.ua.syncToVault(projectId))
      toast.success(
        res.movedFiles.length > 0 ? `已收纳 ${res.movedFiles.length} 个文件到 Vault 并清理仓库` : '已清理仓库中的 .ua 目录',
        res.vaultRel
      )
      await qc.invalidateQueries({ queryKey: qk.uaGraph(projectId) })
    } catch (e) {
      toast.error(e, '收纳到 Vault 失败')
    } finally {
      setSyncing(false)
    }
  }

  const sendToShell = async (line: string, tip: string) => {
    try {
      const session = await unwrap(api.shell.open(projectId, 120, 24))
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
    sendToShell(UA_PLUGIN_INSTALL_CMD, '已在底部终端安装 UA 插件，完成后点卡片「刷新」即可生成图谱')

  const runInTerminal = async () => {
    try {
      const plan = await unwrap(api.ua.prepareTerminal(projectId))
      await sendToShell(plan.shellLine, `已在终端启动图谱分析，退出 Claude 后将自动收纳至 Vault（${plan.vaultRel}）`)
    } catch (e) {
      toast.error(e, '准备终端图谱分析失败')
    }
  }

  const copyAndOpenCursor = async () => {
    try {
      await navigator.clipboard.writeText(CURSOR_UA_COMMAND)
      toast.success(`已复制 ${CURSOR_UA_COMMAND}，在 Cursor 生成后回工作台点「收纳到 Vault」即可清理仓库`)
    } catch {
      // 剪贴板不可用时仍继续打开 Cursor
    }
    await openWith(projectId, 'cursor')
  }

  return (
    <CollapsibleCard
      storageKey="ua"
      title="Understand Anything"
      badges={
        <>
          {viewerUrl && (
            <span className="task-status st-done" title={viewerUrl}>
              看板运行中
            </span>
          )}
          {inVault && (
            <span className="task-status st-todo" title="图谱保存在 Obsidian Vault 中，不污染代码仓库">
              已存 Vault
            </span>
          )}
          {stale && (
            <span className="task-status st-doing" title="仓库有新提交，可增量更新图谱">
              落后于最新提交
            </span>
          )}
          {status.data && !pluginInstalled && (
            <span className="task-status st-todo" title="Claude Code 尚未安装 understand-anything 插件">
              未装 Claude 插件
            </span>
          )}
        </>
      }
      actions={
        <button
          className="btn btn-small"
          type="button"
          disabled={status.isFetching}
          onClick={() => void qc.invalidateQueries({ queryKey: qk.uaGraph(projectId) })}
        >
          {status.isFetching ? '刷新中…' : '刷新'}
        </button>
      }
    >
      {status.isPending && <p className="hint">检查图谱…</p>}
      {status.isError && <p className="error-text">{status.error.message}</p>}

      {status.data?.hasGraph ? (
        <>
          <p className="hint">
            {inVault ? 'Vault 路径 ' : '位置 '}
            <span className="mono">{status.data.graphRel}</span>
            {summary && (
              <>
                {' · '}节点 {summary.nodeCount} · 边 {summary.edgeCount} · 分层 {summary.layerCount} · 导览{' '}
                {summary.tourCount}
                {summary.hasDomainGraph ? ' · 含业务域图谱' : ''}
              </>
            )}
            {shortGraphCommit && (
              <>
                {' · '}基准提交 <span className="mono">{shortGraphCommit}</span>
              </>
            )}
            {summary?.analyzedAt && <>（{localTime(summary.analyzedAt)}）</>}
            {stale && headCommit && (
              <span className="warn-text">
                {' '}
                · 当前提交为 <span className="mono">{headCommit}</span>，建议运行增量更新
              </span>
            )}
          </p>
          {summary?.description && <p className="hint">{summary.description}</p>}
          {hasRepoResidue && (
            <p className="hint warn-text">
              检测到代码仓库下有 <span className="mono">.ua/</span> 目录（若终端分析仍在进行请等完成后再点），可一键收纳至
              Vault 并清理仓库。
            </p>
          )}
          <div className="button-row">
            <button className="btn btn-primary" type="button" disabled={opening} onClick={() => void open()}>
              {opening ? '启动中…' : viewerUrl ? '重新打开看板' : '打开 UA 看板'}
            </button>
            {viewerUrl && (
              <button className="btn" type="button" disabled={stopping} onClick={() => void stop()}>
                {stopping ? '停止中…' : '停止看板'}
              </button>
            )}
            {hasRepoResidue && (
              <button className="btn" type="button" disabled={syncing} onClick={() => void syncToVault()}>
                {syncing ? '收纳中…' : '收纳到 Vault 并清理仓库'}
              </button>
            )}
            {pluginInstalled ? (
              <button
                className="btn"
                type="button"
                title="自动将 Vault 中已有图谱临时铺回仓库做增量分析，退出 Claude 后自动归档回 Vault 并清理仓库"
                onClick={() => void runInTerminal()}
              >
                在终端增量更新
              </button>
            ) : (
              <button
                className="btn"
                type="button"
                title={`在底部终端执行 ${UA_PLUGIN_INSTALL_CMD}`}
                onClick={() => void installPluginInTerminal()}
              >
                安装 UA 插件
              </button>
            )}
            <button className="btn btn-ghost" type="button" onClick={() => void copyAndOpenCursor()}>
              复制命令并去 Cursor
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => void unwrap(api.app.openExternal(UA_REPO))}>
              插件说明
            </button>
          </div>
        </>
      ) : status.data ? (
        <>
          {pluginInstalled ? (
            <p className="hint">
              Vault 中还没有该项目的图谱（目标位置：<span className="mono">{status.data.graphRel ?? '项目/<名称>/.ua/knowledge-graph.json'}</span>
              ）。点「在终端生成图谱」会在仓库运行分析，退出 Claude 时自动归档到 Vault 并清理仓库 <span className="mono">.ua/</span>。
            </p>
          ) : (
            <p className="hint">
              Vault 中还没有该项目的图谱，且检测到本机 Claude Code 尚未安装 <span className="mono">understand-anything</span>{' '}
              插件。请先点「在终端安装 UA 插件」，完成后点右上角「刷新」即可生成图谱。
            </p>
          )}
          {hasRepoResidue && (
            <p className="hint warn-text">
              检测到代码仓库下已有 <span className="mono">.ua/</span> 目录（若正在分析请等完成后操作），可点「收纳到 Vault
              并清理仓库」将其移入 Vault。
            </p>
          )}
          <div className="button-row">
            {pluginInstalled ? (
              <button className="btn btn-primary" type="button" onClick={() => void runInTerminal()}>
                在终端生成图谱
              </button>
            ) : (
              <button
                className="btn btn-primary"
                type="button"
                title={UA_PLUGIN_INSTALL_CMD}
                onClick={() => void installPluginInTerminal()}
              >
                在终端安装 UA 插件
              </button>
            )}
            {hasRepoResidue && (
              <button className="btn" type="button" disabled={syncing} onClick={() => void syncToVault()}>
                {syncing ? '收纳中…' : '收纳到 Vault 并清理仓库'}
              </button>
            )}
            <button className="btn" type="button" onClick={() => void copyAndOpenCursor()}>
              复制命令并打开 Cursor
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => void unwrap(api.app.openExternal(UA_REPO))}>
              了解 Understand Anything
            </button>
          </div>
        </>
      ) : null}
    </CollapsibleCard>
  )
}


