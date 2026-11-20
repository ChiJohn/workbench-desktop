/** 工作台内嵌 Multica 的默认地址，对应本机 Docker。 */
export const DEFAULT_MULTICA_WEB_URL = 'http://localhost:3000'

/** 云端问题列表。面板可以临时打开，也可以把它设成默认地址。 */
export const CLOUD_MULTICA_WEB_URL = 'https://multica.ai/jinbi/issues'

const CLOUD_HOSTS = new Set(['multica.ai', 'www.multica.ai'])

/** 空值用默认地址。没有协议时补上 http://，并去掉路径末尾的斜杠。 */
export function normalizeMulticaWebUrl(input?: string | null): string {
  const raw = input?.trim() ?? ''
  if (!raw) return DEFAULT_MULTICA_WEB_URL
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `http://${raw}`
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_MULTICA_WEB_URL
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
    return `${url.origin}${path}${url.search}${url.hash}`
  } catch {
    return DEFAULT_MULTICA_WEB_URL
  }
}

function parseHttp(input: string): URL | null {
  try {
    const url = new URL(input)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

/** 云端、本机，或与当前配置同源的地址，可以留在内嵌面板里。 */
export function isEmbeddableMulticaUrl(input: string, base?: string | null): boolean {
  const url = parseHttp(input)
  if (!url) return false
  if (CLOUD_HOSTS.has(url.hostname)) return true
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true
  try {
    return url.origin === new URL(normalizeMulticaWebUrl(base)).origin
  } catch {
    return false
  }
}

/**
 * 把一次跳转落到配置的 Multica 上。
 * 问题链接只替换来源，保留路径；不是 Multica 的链接返回 null。
 */
export function multicaPanelUrl(link?: string | null, base?: string | null): string | null {
  const home = normalizeMulticaWebUrl(base)
  if (!link?.trim()) return home
  if (!isEmbeddableMulticaUrl(link, home)) return null
  const target = parseHttp(link)
  if (!target || target.pathname === '/') return home
  const homeUrl = new URL(home)
  return `${homeUrl.origin}${target.pathname}${target.search}${target.hash}`
}
