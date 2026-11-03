import type { QuickLink } from './types'

/** 未在设置里自定义时，侧栏底部显示的默认快速入口 */
export const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { name: 'Apifox', url: 'https://app.apifox.com' },
  { name: 'Figma', url: 'https://www.figma.com' },
  { name: 'TAPD', url: 'https://www.tapd.cn' },
  { name: 'CNB', url: 'https://cnb.cool' }
]

export function bookmarkList(links?: QuickLink[]): QuickLink[] {
  return links ?? DEFAULT_QUICK_LINKS
}

/** 未设置 pinned 的旧链接仍钉在侧栏 */
export function sidebarLinks(links?: QuickLink[]): QuickLink[] {
  return bookmarkList(links).filter((link) => link.pinned !== false)
}

export function prepareBookmark(name: string, url: string): { name: string; url: string; pinned: false } | { error: string } {
  const href = url.trim()
  if (!/^https?:\/\//i.test(href)) return { error: '只接受 http 或 https 链接' }
  let host = ''
  try {
    host = new URL(href).host
  } catch {
    return { error: '这个网址无法识别' }
  }
  if (!host) return { error: '这个网址无法识别' }
  return { name: name.trim() || host, url: href, pinned: false }
}
