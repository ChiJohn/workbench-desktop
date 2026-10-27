/** 从远程地址或本地路径取出仓库名；识别不了返回 null */
export function repoNameFromUrl(url: string): string | null {
  const text = url.trim()
  if (!text) return null
  let path = text
  if (/^[a-zA-Z]:[\\/]/.test(text) || text.startsWith('\\\\') || text.startsWith('/')) {
    path = text
  } else {
    const scp = text.match(/^[\w.+-]+@[\w.-]+:(.+)$/)
    if (scp) {
      path = scp[1]
    } else {
      try {
        path = new URL(text).pathname
      } catch {
        return null
      }
    }
  }
  const seg = path.split(/[\\/]/).filter(Boolean).pop()
  if (!seg) return null
  let name = seg
  try {
    name = decodeURIComponent(seg)
  } catch {
    return null
  }
  name = name.replace(/\.git$/i, '')
  if (!name || /[\\/|[\]#]/.test(name) || name === '.' || name === '..') return null
  return name
}
