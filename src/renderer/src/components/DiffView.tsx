import { pairDiff, type DiffRow } from '../../../shared/pairDiff'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function sideHtml(row: DiffRow, side: 'left' | 'right'): string {
  const text = side === 'left' ? row.left : row.right
  const no = side === 'left' ? row.leftNo : row.rightNo
  const filled = text !== undefined
  const tone = !filled
    ? 'diff-empty'
    : row.kind === 'change'
      ? side === 'left'
        ? 'diff-del'
        : 'diff-add'
      : row.kind === 'del'
        ? 'diff-del'
        : row.kind === 'add'
          ? 'diff-add'
          : ''
  return `<div class="diff-side ${tone}"><span class="diff-no">${no ?? ''}</span><span class="diff-text">${filled ? escapeHtml(text) || ' ' : ''}</span></div>`
}

/** 左右对照。整段一次写入，避免每个格子都成为 React 节点。 */
export function DiffView({ text }: { text: string }) {
  if (!text.trim()) {
    return <div className="diff-view muted">（无文本差异，可能仅换行符或文件权限变更）</div>
  }
  const parsed = pairDiff(text)
  if (parsed.binary) return <div className="diff-view muted">二进制文件，无法并排比较</div>
  if (parsed.rows.length === 0) {
    return <div className="diff-view muted">（无文本差异，可能仅换行符或文件权限变更）</div>
  }
  const html = parsed.rows
    .map((row) =>
      row.kind === 'file' || row.kind === 'hunk'
        ? `<div class="diff-meta">${escapeHtml(row.text ?? '')}</div>`
        : `<div class="diff-pair">${sideHtml(row, 'left')}${sideHtml(row, 'right')}</div>`
    )
    .join('')
  const more = parsed.truncated ? '<div class="diff-meta">后面的差异已省略</div>' : ''
  return <div className="diff-view diff-split" dangerouslySetInnerHTML={{ __html: html + more }} />
}
