export function DiffView({ text }: { text: string }) {
  if (!text.trim()) {
    return <div className="diff-view muted">（无文本差异，可能仅换行符或文件权限变更）</div>
  }
  return (
    <pre className="diff-view">
      {text.split('\n').map((line, i) => {
        const cls =
          line.startsWith('+++') || line.startsWith('---')
            ? 'muted'
            : line.startsWith('+')
              ? 'diff-add'
              : line.startsWith('-')
                ? 'diff-del'
                : line.startsWith('@@')
                  ? 'diff-hunk'
                  : undefined
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}
