import { useEffect, useState } from 'react'
import type { KnowledgeSearchGroup, Project } from '../../../shared/types'
import { api, unwrap } from '../api'
import { useKnowledge } from '../stores/knowledge'
import { toast } from '../stores/toast'

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
    </div>
  )
}
