export function normalizeRepoPath(p: string): string {
  return p.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}
