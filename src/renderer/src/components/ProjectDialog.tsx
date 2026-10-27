import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PROJECT_TYPE_LABELS, type CloneProgress, type Project, type ProjectType, type ProjectWriteRequest } from '../../../shared/types'
import { repoNameFromUrl } from '../../../shared/repoUrl'
import { ApiError, api, unwrap } from '../api'
import { TYPE_ORDER } from '../format'
import { qk } from '../queries'
import { toast } from '../stores/toast'
import { useUi } from '../stores/ui'

function baseName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? ''
}

function joinWin(root: string, name: string): string {
  return `${root.replace(/[/\\]+$/, '')}\\${name}`
}

export function ProjectDialog({ projects, codeRoot }: { projects: Project[]; codeRoot?: string }) {
  const editor = useUi((s) => s.projectEditor)
  const closeEditor = useUi((s) => s.closeProjectEditor)
  const setView = useUi((s) => s.setView)
  const qc = useQueryClient()
  const project = editor?.mode === 'edit' ? projects.find((p) => p.id === editor.id) : undefined
  const key = !editor ? '' : editor.mode === 'add' ? 'add' : editor.id

  const [tab, setTab] = useState<'local' | 'clone'>('local')
  const [name, setName] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [type, setType] = useState<ProjectType>('other')
  const [note, setNote] = useState('')
  const [typeLabel, setTypeLabel] = useState<string | undefined>()
  const [home, setHome] = useState(true)
  const [autoName, setAutoName] = useState(true)
  const [url, setUrl] = useState('')
  const [cloning, setCloning] = useState(false)
  const [progress, setProgress] = useState<CloneProgress | null>(null)
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const cloningRef = useRef(false)

  useEffect(() => {
    cloningRef.current = cloning
  }, [cloning])

  useEffect(() => {
    if (!key) return
    setTab('local')
    setUrl('')
    setCloning(false)
    setProgress(null)
    setLocked(false)
    setBusy(false)
    if (key === 'add') {
      const editor = useUi.getState().projectEditor
      const draftName = editor?.mode === 'add' ? (editor.name ?? '') : ''
      const draftPath = editor?.mode === 'add' ? (editor.repoPath ?? '') : ''
      setName(draftName)
      setRepoPath(draftPath)
      setType('other')
      setNote('')
      setTypeLabel(undefined)
      setHome(true)
      setAutoName(!draftName)
      return
    }
    const current = projects.find((p) => p.id === key)
    if (!current) return
    setName(current.name)
    setRepoPath(current.repoPath)
    setType(current.type)
    setNote(current.note)
    setTypeLabel(current.typeLabel)
    setHome(false)
    setAutoName(false)
    // 只在打开时填一次，避免列表刷新冲掉正在编辑的内容
  }, [key])

  useEffect(() => api.on.projectCloneProgress(setProgress), [])
  useEffect(
    () => () => {
      if (cloningRef.current) void api.project.cancelClone()
    },
    []
  )

  if (!editor || (editor.mode === 'edit' && !project)) return null

  const close = () => {
    if (cloningRef.current) void api.project.cancelClone()
    closeEditor()
  }

  const applyDir = async (dir: string) => {
    setRepoPath(dir)
    setLocked(false)
    setTypeLabel(undefined)
    if (autoName) setName(baseName(dir))
    try {
      setType(await unwrap(api.project.detectType(dir)))
    } catch (e) {
      toast.error(e, '判断类型失败')
    }
  }

  const pick = async () => {
    const dir = await unwrap(api.app.pickFolder(repoPath || codeRoot))
    if (dir) await applyDir(dir)
  }

  const onUrl = (value: string) => {
    setUrl(value)
    const repo = repoNameFromUrl(value)
    if (!repo) return
    if (autoName) setName(repo)
    if (codeRoot?.trim()) setRepoPath(joinWin(codeRoot.trim(), repo))
  }

  const clone = async () => {
    const dest = repoPath.trim()
    if (!dest) {
      toast.failure('请填写目录，或先在设置里填写代码根目录')
      return
    }
    setCloning(true)
    setProgress(null)
    try {
      await unwrap(api.project.clone({ url, dest }))
      setLocked(true)
      setTab('local')
      setTypeLabel(undefined)
      try {
        setType(await unwrap(api.project.detectType(dest)))
      } catch {
        setType('other')
      }
      toast.success('克隆完成，确认信息后登记')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CLONE_CANCELLED') toast.success(e.message)
      else toast.error(e, '克隆失败')
    } finally {
      setCloning(false)
    }
  }

  const save = async () => {
    const req: ProjectWriteRequest = {
      name: name.trim(),
      repoPath: repoPath.trim(),
      type,
      note: note.trim(),
      typeLabel,
      createHomepage: home
    }
    setBusy(true)
    try {
      const saved = editor.mode === 'edit' ? await unwrap(api.project.update(editor.id, req)) : await unwrap(api.project.add(req))
      await qc.invalidateQueries({ queryKey: qk.registry })
      setView({ kind: 'project', id: saved.id })
      closeEditor()
      toast.success(saved.available ? (editor.mode === 'edit' ? '已更新项目' : '已添加项目') : `已保存，但${saved.unavailableReason}`)
    } catch (e) {
      toast.error(e, '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const showForm = editor.mode === 'edit' || tab === 'local' || locked
  const renamed = editor.mode === 'edit' && project && name.trim() !== project.name

  return (
    <div className="modal-mask">
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>{editor.mode === 'edit' ? '编辑项目' : '新增项目'}</h2>
        {editor.mode === 'add' && !locked && (
          <div className="tabs">
            <button className={`btn${tab === 'local' ? ' btn-primary' : ''}`} type="button" onClick={() => setTab('local')}>
              本地目录
            </button>
            <button className={`btn${tab === 'clone' ? ' btn-primary' : ''}`} type="button" onClick={() => setTab('clone')}>
              远程克隆
            </button>
          </div>
        )}
        {showForm ? (
          <div className="form">
            <label>
              <span>目录</span>
              <div className="knowledge-row">
                <input className="mono" value={repoPath} disabled={locked || busy} onChange={(e) => setRepoPath(e.target.value)} />
                {!locked && (
                  <button className="btn" type="button" disabled={busy} onClick={() => void pick()}>
                    选择…
                  </button>
                )}
              </div>
            </label>
            <label>
              <span>项目名</span>
              <input
                value={name}
                disabled={busy}
                onChange={(e) => {
                  setAutoName(false)
                  setName(e.target.value)
                }}
              />
              {renamed && <small>旧的 项目/{project.name}/ 文件夹不会移动</small>}
            </label>
            <label>
              <span>类型</span>
              <select value={type} disabled={busy} onChange={(e) => setType(e.target.value as ProjectType)}>
                {TYPE_ORDER.map((item) => (
                  <option key={item} value={item}>
                    {PROJECT_TYPE_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>说明</span>
              <input value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={home} disabled={busy} onChange={(e) => setHome(e.target.checked)} />
              <span>同时创建项目主页</span>
            </label>
          </div>
        ) : (
          <div className="form">
            <label>
              <span>仓库地址</span>
              <input className="mono" value={url} disabled={cloning} placeholder="https:// 或 git@host:group/repo.git" onChange={(e) => onUrl(e.target.value)} />
            </label>
            <label>
              <span>目录</span>
              <input className="mono" value={repoPath} disabled={cloning} placeholder={codeRoot ? `${codeRoot}\\仓库名` : '先填写代码根目录，或直接填完整路径'} onChange={(e) => setRepoPath(e.target.value)} />
            </label>
            {cloning && (
              <div className="hint">
                {progress?.percent != null ? <progress value={progress.percent} max={100} /> : <progress />}
                <span>
                  {progress?.phase === 'resolving' ? '解析差异' : '接收对象'}
                  {progress?.percent != null ? ` ${progress.percent}%` : '…'}
                </span>
              </div>
            )}
          </div>
        )}
        <div className="button-row">
          {showForm ? (
            <button className="btn btn-primary" type="button" disabled={busy || !name.trim() || !repoPath.trim()} onClick={() => void save()}>
              {busy ? '保存中…' : '登记'}
            </button>
          ) : cloning ? (
            <button className="btn" type="button" onClick={() => void api.project.cancelClone()}>
              取消
            </button>
          ) : (
            <button className="btn btn-primary" type="button" disabled={!url.trim() || !repoPath.trim()} onClick={() => void clone()}>
              克隆
            </button>
          )}
          <button className="btn btn-ghost" type="button" onClick={close}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
