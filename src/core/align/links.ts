import { AppError } from '../result'

export interface FigmaLink {
  kind: 'figma'
  url: string
  nodeId: string
  name: string
}

export interface ApifoxLink {
  kind: 'apifox'
  url: string
  projectId: string
  apiId: string
}

export type ClassifiedLink = FigmaLink | ApifoxLink

const URL_IN_TEXT = /https?:\/\/[^\s<>)\]]+/gi

function clean(raw: string): string {
  return raw.trim().replace(/[.,]+$/, '')
}

/** 粘贴的单个链接；无法识别时抛错 */
export function classifyLink(raw: string): ClassifiedLink {
  const text = clean(raw)
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new AppError('ALIGN_LINK', '只支持 Figma 节点链接和 Apifox 接口链接')
  }
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'figma.com') {
    const nodeId = url.searchParams.get('node-id')
    if (!nodeId) throw new AppError('ALIGN_FIGMA_NODE', '请复制节点链接：在 Figma 里右键节点，选「复制链接」')
    if (!/^\/(design|file)\//.test(url.pathname)) throw new AppError('ALIGN_LINK', '只支持 Figma 节点链接和 Apifox 接口链接')
    return { kind: 'figma', url: url.toString(), nodeId, name: `节点 ${nodeId}` }
  }
  if (host === 'app.apifox.com' || host === 'apifox.com') {
    const projectId = url.pathname.match(/\/project\/(\d+)/)?.[1]
    const apiId = url.pathname.match(/\/apis\/api-(\d+)/)?.[1]
    if (!projectId || !apiId) {
      throw new AppError('ALIGN_LINK', '无法识别的 Apifox 链接，请复制接口详情页的链接')
    }
    return { kind: 'apifox', url: url.toString(), projectId, apiId }
  }
  throw new AppError('ALIGN_LINK', '只支持 Figma 节点链接和 Apifox 接口链接')
}

/** 从正文里找出能识别的链接，去重，跳过不完整的 */
export function findLinks(text: string): ClassifiedLink[] {
  const seen = new Set<string>()
  const found: ClassifiedLink[] = []
  for (const raw of text.match(URL_IN_TEXT) ?? []) {
    try {
      const link = classifyLink(raw)
      if (seen.has(link.url)) continue
      seen.add(link.url)
      found.push(link)
    } catch {
      // 扫描时跳过不完整的链接，粘贴时才报错
    }
  }
  return found
}
