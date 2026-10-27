import { readSection, writeSection } from '../markdown/sections'
import type { FigmaLink } from './links'

const HEADING = '设计与接口'

export interface DesignRef {
  name: string
  url: string
}

export interface ApiRef {
  /** 不含 .md 的 vault 路径 */
  target: string
  title: string
  url?: string
}

export interface AlignRefs {
  designs: DesignRef[]
  apis: ApiRef[]
}

function subsection(body: string, title: string): string {
  const start = body.search(new RegExp(`^### ${title}\\s*$`, 'm'))
  if (start < 0) return ''
  const from = body.slice(start).replace(/^### [^\n]*\n?/, '')
  const next = from.search(/^### /m)
  return (next < 0 ? from : from.slice(0, next)).trim()
}

function parseDesigns(body: string): DesignRef[] {
  return [...subsection(body, '设计稿').matchAll(/^- \[(.+?)\]\((https?:\/\/[^)]+)\)\s*$/gm)].map((m) => ({ name: m[1], url: m[2] }))
}

function parseApis(body: string): ApiRef[] {
  return [...subsection(body, '接口').matchAll(/^- \[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*(.*)$/gm)].map((m) => {
    const rest = m[2].trim()
    const url = rest.match(/<(https?:\/\/[^>]+)>\s*$/)
    const title = (url ? rest.slice(0, url.index).trim() : rest) || m[1].trim()
    return { target: m[1].trim(), title, ...(url && { url: url[1] }) }
  })
}

export function readAlign(md: string): AlignRefs {
  const body = readSection(md, HEADING) ?? ''
  return { designs: parseDesigns(body), apis: parseApis(body) }
}

function render(refs: AlignRefs): string {
  const designs = refs.designs.map((d) => `- [${d.name.replace(/[\[\]]/g, '')}](${d.url})`).join('\n')
  const apis = refs.apis.map((a) => `- [[${a.target}]] ${a.title}${a.url ? ` <${a.url}>` : ''}`).join('\n')
  return `### 设计稿\n\n${designs}\n\n### 接口\n\n${apis}`.trim()
}

/** 插在「描述」和「概况」之间；已有小节时只替换正文 */
export function writeAlign(md: string, refs: AlignRefs): string {
  const body = render(refs)
  if (readSection(md, HEADING) !== null) return writeSection(md, HEADING, () => body)
  const block = `## ${HEADING}\n\n${body}\n\n`
  const overview = md.search(/^## 概况[ \t]*$/m)
  if (overview >= 0) return `${md.slice(0, overview)}${block}${md.slice(overview)}`
  return `${md.replace(/\s*$/, '')}\n\n${block}`
}

export function addDesign(md: string, link: FigmaLink): string {
  const refs = readAlign(md)
  if (refs.designs.some((d) => d.url === link.url)) return md
  refs.designs.push({ name: link.name, url: link.url })
  return writeAlign(md, refs)
}

export function renameDesign(md: string, url: string, name: string): string {
  const refs = readAlign(md)
  const item = refs.designs.find((d) => d.url === url)
  if (!item) return md
  item.name = name.trim() || item.name
  return writeAlign(md, refs)
}

export function addApi(md: string, api: ApiRef): string {
  const refs = readAlign(md)
  if (refs.apis.some((a) => a.target === api.target)) return md
  refs.apis.push(api)
  return writeAlign(md, refs)
}

export function removeAlign(md: string, urlOrTarget: string): string {
  const refs = readAlign(md)
  refs.designs = refs.designs.filter((d) => d.url !== urlOrTarget)
  refs.apis = refs.apis.filter((a) => a.target !== urlOrTarget && `${a.target}.md` !== urlOrTarget)
  return writeAlign(md, refs)
}
