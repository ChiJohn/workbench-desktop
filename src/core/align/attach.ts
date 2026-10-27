import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { readFrontmatter } from '../markdown/sections'
import { AppError } from '../result'
import { addApi, addDesign, readAlign, removeAlign, renameDesign } from './cardSection'
import { contractFileName, renderContract, type FoundOperation } from './contract'
import type { ApifoxLink, FigmaLink } from './links'

export interface AlignView {
  designs: { name: string; url: string }[]
  apis: { title: string; target: string; path: string; url: string }[]
}

function inside(vault: string, rel: string): string {
  const full = resolve(vault, rel)
  const root = resolve(vault)
  if (full !== root && !full.startsWith(root + sep)) throw new AppError('ALIGN_LINK', '路径超出 vault')
  return full
}

export async function listAlign(vault: string, cardRel: string | null): Promise<AlignView> {
  if (!cardRel) return { designs: [], apis: [] }
  const md = await readFile(inside(vault, cardRel), 'utf8')
  const refs = readAlign(md)
  return {
    designs: refs.designs,
    apis: refs.apis.map((a) => ({ title: a.title, target: a.target, path: `${a.target}.md`, url: a.url ?? '' }))
  }
}

export async function attachFigma(vault: string, cardRel: string, link: FigmaLink): Promise<void> {
  const full = inside(vault, cardRel)
  const md = await readFile(full, 'utf8')
  await writeFile(full, addDesign(md, link), 'utf8')
}

export async function renameFigma(vault: string, cardRel: string, url: string, name: string): Promise<void> {
  const full = inside(vault, cardRel)
  const md = await readFile(full, 'utf8')
  await writeFile(full, renameDesign(md, url, name), 'utf8')
}

export async function detach(vault: string, cardRel: string, urlOrTarget: string): Promise<void> {
  const full = inside(vault, cardRel)
  const md = await readFile(full, 'utf8')
  await writeFile(full, removeAlign(md, urlOrTarget), 'utf8')
}

async function savedContract(vault: string, projectName: string, apiId: string): Promise<{ target: string; title: string } | null> {
  const dir = join(vault, '项目', projectName, '接口')
  if (!existsSync(dir)) return null
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.md')) continue
    const md = await readFile(join(dir, name), 'utf8')
    const fm = readFrontmatter(md)
    if (fm.apifox_api !== apiId) continue
    const title = md.match(/^# (.+)$/m)?.[1]?.trim() || name
    return { target: `项目/${projectName}/接口/${name.replace(/\.md$/, '')}`, title }
  }
  return null
}

/** 同一接口的契约已存在且不是刷新时，直接链接，不重新拉取 */
export async function attachApi(
  vault: string,
  cardRel: string,
  projectName: string,
  link: ApifoxLink,
  load: (link: ApifoxLink) => Promise<{ doc: Parameters<typeof renderContract>[0]; found: FoundOperation }>,
  now: Date,
  refresh: boolean
): Promise<string> {
  let saved = refresh ? null : await savedContract(vault, projectName, link.apiId)
  if (!saved) {
    const loaded = await load(link)
    const fileName = contractFileName(loaded.found.method, loaded.found.path)
    const rel = `项目/${projectName}/接口/${fileName}`
    const full = inside(vault, rel)
    const markdown = renderContract(loaded.doc, loaded.found, {
      projectId: link.projectId,
      apiId: link.apiId,
      source: link.url,
      fetched: stamp(now)
    })
    await mkdir(dirname(full), { recursive: true })
    const tmp = `${full}.tmp`
    await writeFile(tmp, markdown, 'utf8')
    await rename(tmp, full)
    saved = { target: rel.replace(/\.md$/, ''), title: loaded.found.title }
  }
  const card = inside(vault, cardRel)
  const md = await readFile(card, 'utf8')
  await writeFile(card, addApi(md, { ...saved, url: link.url }), 'utf8')
  return `${saved.target}.md`
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
