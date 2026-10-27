import { useState } from 'react'
import type { KnowledgePrefs, ReportWriter } from '../../../shared/types'
import { useSavePrefs } from '../queries'
import { WRITER_OPTIONS } from './ReportsPage'

export function KnowledgeSettings({ prefs }: { prefs: KnowledgePrefs }) {
  const save = useSavePrefs()
  const [cli, setCli] = useState(prefs.obsidianCli ?? '')
  const writer = prefs.writer ?? 'cursor'
  const patch = (p: KnowledgePrefs) => save.mutate({ knowledge: p })

  return (
    <section className="card form">
      <h2>知识</h2>
      <label>
        <span>写稿工具</span>
        <select value={writer} disabled={save.isPending} onChange={(e) => patch({ writer: e.target.value as ReportWriter })}>
          {WRITER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <small>默认 cursor-agent。Claude、cursor-agent 和 Codex 的路径都沿用「汇报」里的设置</small>
      </label>
      <label>
        <span>Obsidian CLI</span>
        <input
          className="mono"
          placeholder="留空则自动查找 Obsidian.com"
          value={cli}
          onChange={(e) => setCli(e.target.value)}
          onBlur={() => cli.trim() !== (prefs.obsidianCli ?? '') && patch({ obsidianCli: cli.trim() || undefined })}
        />
        <small>快速搜索用。Obsidian 没开时，第一次搜索会把它拉起来</small>
      </label>
    </section>
  )
}
