import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { noteKey, REPORT_KIND_LABELS, REPORT_SOURCE_LABELS, shiftPeriod } from '../../../shared/reportPeriod'
import type { Prefs, ReportEntry, ReportKind, ReportMaterial, ReportSourceResult, ReportWriter } from '../../../shared/types'
import { api, unwrap } from '../api'
import { qk, useReportMaterial, useSavePrefs } from '../queries'
import { useReport } from '../stores/report'
import { toast } from '../stores/toast'

const KINDS: ReportKind[] = ['daily', 'weekly', 'monthly']
export const WRITER_OPTIONS: { value: ReportWriter; label: string }[] = [
  { value: 'claude', label: 'Claude Code' },
  { value: 'cursor', label: 'cursor-agent' }
]

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.round((now - since) / 1000))
  return <span className="mono">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>
}

function Checkbox({ checked, partial, onChange }: { checked: boolean; partial?: boolean; onChange(v: boolean): void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(partial)
  }, [partial])
  return <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
}

function SourceBlock({ result }: { result: ReportSourceResult }) {
  const excluded = useReport((s) => s.excluded)
  const setExcluded = useReport((s) => s.setExcluded)
  const ids = result.entries.map((e) => e.id)
  const selected = ids.filter((id) => !excluded[id]).length
  const groups = new Map<string, ReportEntry[]>()
  for (const e of result.entries) groups.set(e.group, [...(groups.get(e.group) ?? []), e])

  return (
    <div className="report-source">
      <label className="report-source-head">
        <Checkbox checked={ids.length > 0 && selected === ids.length} partial={selected > 0 && selected < ids.length} onChange={(v) => setExcluded(ids, !v)} />
        <span className="strong">{REPORT_SOURCE_LABELS[result.source]}</span>
        <span className="muted">
          {selected}/{ids.length}
        </span>
      </label>
      {result.error && <p className="error-text report-source-error">{result.error}</p>}
      {[...groups].map(([group, entries]) => (
        <div key={group} className="report-group">
          <div className="report-group-title">{group}</div>
          {entries.map((e) => (
            <label key={e.id} className={excluded[e.id] ? 'report-entry off' : 'report-entry'}>
              <input type="checkbox" checked={!excluded[e.id]} onChange={(ev) => setExcluded([e.id], !ev.target.checked)} />
              <span className="report-entry-body">
                <span className="report-entry-title">
                  <span className="muted mono">{e.time.slice(5)}</span> {e.title}
                  {e.url && (
                    <a
                      className="report-entry-link"
                      href={e.url}
                      onClick={(ev) => {
                        ev.preventDefault()
                        void unwrap(api.app.openExternal(e.url!)).catch((err) => toast.error(err, '打开失败'))
                      }}
                    >
                      ↗
                    </a>
                  )}
                </span>
                {e.detail && <span className="report-entry-detail">{e.detail}</span>}
              </span>
            </label>
          ))}
        </div>
      ))}
      {!result.error && ids.length === 0 && <p className="hint report-source-error">没有记录</p>}
    </div>
  )
}

export function ReportsPage({ prefs }: { prefs?: Prefs }) {
  const qc = useQueryClient()
  const { kind, ranges, excluded, drafts, generating, setKind, open, setRange, setDraft, generate } = useReport()
  const range = ranges[kind]
  const key = noteKey(kind, range)
  const material = useReportMaterial(kind, range)
  const save = useSavePrefs()
  const savedNotes = prefs?.report?.notes?.[key] ?? ''
  const [notes, setNotes] = useState(savedNotes)
  const [saving, setSaving] = useState(false)
  const label = REPORT_KIND_LABELS[kind]

  // 只在切换时间段或偏好首次加载时同步，保存补充说明引起的偏好更新不能覆盖正在输入的内容
  useEffect(() => setNotes(savedNotes), [key, Boolean(prefs)])

  const data = material.data
  const existing = data?.existing ?? null
  const draft = drafts[key] ?? existing?.content ?? ''
  const entries = data ? data.sources.flatMap((s) => s.entries).filter((e) => !excluded[e.id]) : []
  const busy = generating !== null
  const generatingHere = generating?.key === key
  const writer = prefs?.report?.writer ?? 'claude'

  const saveNotes = () => notes !== savedNotes && save.mutate({ report: { notes: { [key]: notes } } })

  const onGenerate = () => {
    if (drafts[key]?.trim() && !window.confirm('重新生成会替换当前草稿，继续？')) return
    saveNotes()
    void generate({ kind, range, entries, notes })
  }

  const onSave = async () => {
    if (existing && existing.content.trim() !== draft.trim() && !window.confirm(`覆盖已有${label}？\n\n${existing.path}`)) return
    setSaving(true)
    try {
      const path = await unwrap(api.report.save(kind, range, draft))
      qc.setQueryData<ReportMaterial>(qk.report(kind, range), (m) => m && { ...m, existing: { path, content: draft.trim() } })
      toast.success(`已保存到 ${path}`)
    } catch (e) {
      toast.error(e, '保存失败')
    }
    setSaving(false)
  }

  const onCopy = async () => {
    await navigator.clipboard.writeText(draft)
    toast.success('已复制')
  }

  const onOpen = () => existing && void unwrap(api.tapd.openCard(existing.path)).catch((e) => toast.error(e, '打开失败'))

  const setDate = (field: 'start' | 'end', value: string) => {
    const next = { ...range, [field]: value }
    if (value && next.start <= next.end) setRange(next)
  }

  return (
    <div className="page report-page">
      <div className="page-header wrap">
        <h1>汇报</h1>
        <div className="segmented">
          {KINDS.map((k) => (
            <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>
              {REPORT_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="report-range">
          <button className="btn btn-small" title="上一期" onClick={() => setRange(shiftPeriod(kind, range, -1))}>
            ‹
          </button>
          <input type="date" value={range.start} onChange={(e) => setDate('start', e.target.value)} />
          <span className="muted">~</span>
          <input type="date" value={range.end} onChange={(e) => setDate('end', e.target.value)} />
          <button className="btn btn-small" title="下一期" onClick={() => setRange(shiftPeriod(kind, range, 1))}>
            ›
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => open(kind)}>
            本期
          </button>
        </div>
        <button className="btn" disabled={material.isFetching} onClick={() => material.refetch()}>
          {material.isFetching ? '收集中…' : '重新收集'}
        </button>
      </div>

      <div className="report-layout">
        <section className="report-material">
          {material.isPending ? (
            <p className="hint">正在收集 git、TAPD、multica 和任务卡…</p>
          ) : material.error ? (
            <p className="error-text">{material.error.message}</p>
          ) : (
            data!.sources.map((s) => <SourceBlock key={s.source} result={s} />)
          )}
        </section>

        <section className="report-editor">
          <label className="report-field">
            <span className="muted">补充说明（会附在素材末尾）</span>
            <textarea rows={3} value={notes} placeholder="例如：参加了需求评审、协助排查线上问题…" onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
          </label>
          <div className="button-row">
            <select value={writer} disabled={busy} onChange={(e) => save.mutate({ report: { writer: e.target.value as ReportWriter } })}>
              {WRITER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {generatingHere ? (
              <>
                <button className="btn btn-danger" onClick={() => void unwrap(api.report.cancel())}>
                  取消
                </button>
                <span className="muted report-progress">
                  {generating.progress} · <Elapsed since={generating.startedAt} />
                </span>
              </>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy || !data || (entries.length === 0 && !notes.trim())}
                title={busy ? '另一份报告正在生成' : undefined}
                onClick={onGenerate}
              >
                生成{label}
              </button>
            )}
          </div>
          {existing && (
            <p className="hint">
              已有{label}：<span className="mono">{existing.path}</span>
              {drafts[key] !== undefined && drafts[key] !== existing.content && <span className="warn-text">（草稿未保存）</span>}
            </p>
          )}
          <textarea
            className="mono report-draft"
            value={draft}
            placeholder={`生成后在这里编辑${label}草稿，也可以直接手写`}
            onChange={(e) => setDraft(key, e.target.value)}
          />
          <div className="button-row">
            <button className="btn btn-primary" disabled={saving || !draft.trim() || generatingHere} onClick={onSave}>
              {saving ? '保存中…' : '保存到 vault'}
            </button>
            <button className="btn" disabled={!draft.trim()} onClick={onCopy}>
              复制
            </button>
            <button className="btn" disabled={!existing} onClick={onOpen}>
              在 Obsidian 打开
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
