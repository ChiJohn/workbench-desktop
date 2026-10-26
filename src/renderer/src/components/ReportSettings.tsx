import { useState } from 'react'
import type { ReportKind, ReportPrefs, ReportReminderPrefs, ReportWriter } from '../../../shared/types'
import { useSavePrefs } from '../queries'
import { WRITER_OPTIONS } from './ReportsPage'

const REMINDER_FIELDS: { kind: ReportKind; label: string; fallback: string }[] = [
  { kind: 'daily', label: '日报（工作日）', fallback: '18:30' },
  { kind: 'weekly', label: '周报（周五）', fallback: '17:00' },
  { kind: 'monthly', label: '月报（月末最后一个工作日）', fallback: '17:00' }
]

function TextPref({ label, value, placeholder, hint, mono, onSave }: { label: string; value: string; placeholder?: string; hint?: string; mono?: boolean; onSave(v: string): void }) {
  const [text, setText] = useState(value)
  return (
    <label>
      <span>{label}</span>
      <input className={mono ? 'mono' : undefined} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() !== value && onSave(text.trim())} />
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function ReportSettings({ prefs }: { prefs: ReportPrefs }) {
  const save = useSavePrefs()
  const patch = (p: ReportPrefs) => save.mutate({ report: p })
  const reminders = prefs.reminders ?? {}
  const setReminder = (p: ReportReminderPrefs) => patch({ reminders: p })

  return (
    <section className="card form">
      <h2>汇报</h2>
      <TextPref
        label="git 作者"
        value={(prefs.authors ?? []).join(', ')}
        placeholder="留空则用 git config user.name"
        hint="多个用逗号分隔，按提交作者名匹配"
        onSave={(v) =>
          patch({
            authors: v
              .split(/[,，]/)
              .map((a) => a.trim())
              .filter(Boolean)
          })
        }
      />
      <TextPref label="姓名" value={prefs.displayName ?? ''} placeholder="留空则用 TAPD 昵称" hint="用于月报文件名" onSave={(v) => patch({ displayName: v || undefined })} />
      <label>
        <span>写稿工具</span>
        <select value={prefs.writer ?? 'claude'} onChange={(e) => patch({ writer: e.target.value as ReportWriter })}>
          {WRITER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <TextPref
        label="Claude Code 路径（可选）"
        mono
        value={prefs.claudePath ?? ''}
        placeholder="留空则按 PATH 中的 claude 找 claude.exe"
        onSave={(v) => patch({ claudePath: v || undefined })}
      />
      <TextPref
        label="cursor-agent 安装目录（可选）"
        mono
        value={prefs.cursorAgentPath ?? ''}
        placeholder="留空则用 %LOCALAPPDATA%\cursor-agent 的最新版本"
        onSave={(v) => patch({ cursorAgentPath: v || undefined })}
      />
      <small className="hint">模板在 vault 的 Templates/汇报-日报.md、汇报-周报.md、汇报-月报.md，首次生成时自动创建，可直接修改</small>

      <h3>提醒</h3>
      <label className="checkbox-row">
        <input type="checkbox" checked={reminders.enabled !== false} onChange={(e) => setReminder({ enabled: e.target.checked })} />
        到点用系统通知提醒（报告已存在则不提醒）
      </label>
      <div className="reminder-times">
        {REMINDER_FIELDS.map((f) => (
          <label key={f.kind}>
            <span>{f.label}</span>
            <input
              type="time"
              disabled={reminders.enabled === false}
              value={reminders[f.kind] ?? f.fallback}
              onChange={(e) => e.target.value && setReminder({ [f.kind]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </section>
  )
}
