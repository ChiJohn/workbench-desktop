export interface CnbRepo {
  web: string
  api: string
  slug: string
}

/** 从 git 远程地址识别 CNB 仓库。其它托管平台返回 null。 */
export function parseCnbRemote(remote: string): CnbRepo | null {
  const trimmed = remote.trim().replace(/\.git$/, '')
  const https = /^https?:\/\/([^/]+)\/(.+)$/i.exec(trimmed)
  const scp = /^git@([^:]+):(.+)$/.exec(trimmed)
  const ssh = /^ssh:\/\/(?:git@)?([^/]+)\/(.+)$/i.exec(trimmed)
  const match = https ?? scp ?? ssh
  if (!match) return null
  const host = match[1].replace(/:\d+$/, '').toLowerCase()
  if (host !== 'cnb.cool' && !host.startsWith('cnb.')) return null
  const slug = match[2].replace(/^\/+|\/+$/g, '')
  if (!slug || slug.split('/').some((part) => !part || part === '.' || part === '..')) return null
  return { web: `https://${host}`, api: `https://api.${host}`, slug }
}
