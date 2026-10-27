import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { AlignState } from '../../../shared/types'
import { api, unwrap } from '../api'
import { qk } from '../queries'
import { toast } from '../stores/toast'

export function AlignSection({ tapdKey }: { tapdKey: string }) {
  const qc = useQueryClient()
  const align = useQuery({ queryKey: qk.align(tapdKey), queryFn: () => unwrap(api.align.list(tapdKey)) })
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')

  const run = async (label: string, work: () => Promise<AlignState>) => {
    setBusy(label)
    try {
      qc.setQueryData(qk.align(tapdKey), await work())
      await qc.invalidateQueries({ queryKey: qk.tapdDetail(tapdKey) })
    } catch (e) {
      toast.error(e, label)
    }
    setBusy(null)
  }

  const add = (raw: string) => {
    const value = raw.trim()
    if (!value) return
    void run('添加失败', async () => {
      const next = await unwrap(api.align.add(tapdKey, value))
      setUrl('')
      return next
    })
  }

  if (align.isPending) return <section className="align-section"><h3>设计与接口</h3><p className="hint">读取中…</p></section>
  if (align.isError) {
    return (
      <section className="align-section">
        <h3>设计与接口</h3>
        <p className="error-text">{align.error.message}</p>
      </section>
    )
  }

  const { designs, apis, detected } = align.data

  return (
    <section className="align-section">
      <h3>设计与接口</h3>
      <div className="align-paste">
        <input
          value={url}
          placeholder="粘贴 Figma 节点链接或 Apifox 接口链接"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add(url)}
        />
        <button className="btn" type="button" disabled={busy !== null || !url.trim()} onClick={() => add(url)}>
          添加
        </button>
      </div>
      {detected.length > 0 && (
        <div className="align-detected">
          <span className="hint">检测到 {detected.length} 个链接</span>
          {detected.map((link) => (
            <button key={link.url} className="btn btn-small" type="button" disabled={busy !== null} title={link.url} onClick={() => add(link.url)}>
              加入 {link.name}
            </button>
          ))}
        </div>
      )}
      {designs.length === 0 && apis.length === 0 && <p className="hint">还没有设计稿或接口。Figma 只记链接；Apifox 会拉取契约写到项目目录。</p>}
      {designs.map((d) => (
        <div key={d.url} className="align-row">
          {editing === d.url ? (
            <>
              <input className="grow" value={name} onChange={(e) => setName(e.target.value)} />
              <button
                className="btn btn-small"
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void run('改名失败', async () => {
                    const next = await unwrap(api.align.rename(tapdKey, d.url, name))
                    setEditing(null)
                    return next
                  })
                }
              >
                保存
              </button>
            </>
          ) : (
            <>
              <span className="grow" title={d.url}>设计稿 · {d.name}</span>
              <button className="btn btn-small" type="button" onClick={() => api.app.openExternal(d.url)}>打开</button>
              <button
                className="btn btn-small"
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setEditing(d.url)
                  setName(d.name)
                }}
              >
                改名
              </button>
            </>
          )}
          <button className="btn btn-small" type="button" disabled={busy !== null} onClick={() => void run('移除失败', () => unwrap(api.align.remove(tapdKey, d.url)))}>
            移除
          </button>
        </div>
      ))}
      {apis.map((a) => (
        <div key={a.target} className="align-row">
          <span className="grow" title={a.path}>接口 · {a.title}</span>
          {a.url && (
            <button className="btn btn-small" type="button" onClick={() => api.app.openExternal(a.url)}>打开</button>
          )}
          <button className="btn btn-small" type="button" disabled={busy !== null} onClick={() => void run('重新拉取失败', () => unwrap(api.align.refresh(tapdKey, a.url)))}>
            重新拉取
          </button>
          <button className="btn btn-small" type="button" disabled={busy !== null} onClick={() => void run('移除失败', () => unwrap(api.align.remove(tapdKey, a.target)))}>
            移除
          </button>
        </div>
      ))}
    </section>
  )
}
