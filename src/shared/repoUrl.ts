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

/** 把 git 远程地址换成浏览器能打开的 https 地址 */
export function remoteWebUrl(remote: string): string | null {
  const text = remote.trim().replace(/\.git$/i, '')
  if (!text) return null
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text)
      const path = url.pathname.replace(/\/+$/, '')
      if (!url.hostname || path === '' || path === '/') return null
      return `${url.protocol}//${url.host}${path}`
    } catch {
      return null
    }
  }
  const scp = /^[\w.+-]+@([\w.-]+):(.+)$/.exec(text)
  if (scp) return https(scp[1], scp[2])
  const ssh = /^ssh:\/\/(?:[\w.+-]+@)?([^/]+)\/(.+)$/i.exec(text)
  if (ssh) return https(ssh[1].replace(/:\d+$/, ''), ssh[2])
  return null
}

function https(host: string, path: string): string | null {
  const slug = path.replace(/^\/+|\/+$/g, '')
  if (!host || !slug) return null
  return `https://${host}/${slug}`
}
