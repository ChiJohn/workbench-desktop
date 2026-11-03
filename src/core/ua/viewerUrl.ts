/** 官方 viewer 启动后在 stdout/stderr 里打印的本地地址 */
export function parseViewerUrl(text: string): string | null {
  const matched = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/\?token=[^\s'"<>]+/i)
  return matched ? matched[0] : null
}

/** 比较图谱记录的 commit 与当前 HEAD（兼容短 hash 与完整 hash） */
export function isUaGraphStale(graphCommit: string | null | undefined, headCommit: string | null | undefined): boolean {
  const a = graphCommit?.trim().toLowerCase()
  const b = headCommit?.trim().toLowerCase()
  if (!a || !b) return false
  return !a.startsWith(b) && !b.startsWith(a)
}

export const UA_VIEWER_PACKAGE =
  'https://github.com/Egonex-AI/Understand-Anything/releases/latest/download/understand-anything-viewer.tgz'

export const UA_PLUGIN_INSTALL_CMD =
  'claude plugin install understand-anything --marketplace Egonex-AI/Understand-Anything'


