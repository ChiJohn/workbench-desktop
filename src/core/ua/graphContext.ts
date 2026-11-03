import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UaDiffImpact, UaImpactedItem } from '../../shared/types'
import { findUaGraph } from './graphDir'

interface ParsedNode {
  id: string
  type: string
  name: string
  filePath: string | null
  summary: string
  tags: string[]
}

interface ParsedEdge {
  source: string
  target: string
  type: string
  direction: string
}

interface ParsedLayer {
  id: string
  name: string
  nodeIds: string[]
}

interface ParsedGraph {
  graphRel: string
  nodes: ParsedNode[]
  edges: ParsedEdge[]
  layers: ParsedLayer[]
}

const ASCII_STOPWORDS = new Set([
  'http',
  'https',
  'www',
  'com',
  'cn',
  'org',
  'net',
  'html',
  'tapd',
  'story',
  'bug',
  'task',
  'src',
  'dist',
  'out',
  'index',
  'main',
  'test',
  'spec',
  'true',
  'false',
  'null',
  'undefined',
  'with',
  'from',
  'this',
  'that',
  'have',
  'will',
  'when',
  'then',
  'into'
])

export function normalizeGraphPath(raw: string): string {
  return raw.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

export interface UaGraphLookup {
  /** 优先使用的图谱数据目录（如 vault/项目/<名称>/.ua） */
  graphDir?: string | null
  /** 展示用相对路径（如 项目/<名称>/.ua/knowledge-graph.json） */
  graphRel?: string | null
}

function loadParsedGraph(repoPath: string, lookup?: UaGraphLookup): ParsedGraph | null {
  let targetDir: string | null = null
  let graphRel = '.ua/knowledge-graph.json'

  if (lookup?.graphDir) {
    targetDir = lookup.graphDir
    graphRel = lookup.graphRel ?? graphRel
  } else {
    const found = findUaGraph(repoPath)
    if (!found) return null
    targetDir = join(repoPath, found.dataDir)
    graphRel = found.graphRel
  }

  let raw: Record<string, unknown>
  try {
    const parsed = JSON.parse(readFileSync(join(targetDir, 'knowledge-graph.json'), 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    raw = parsed as Record<string, unknown>
  } catch {
    return null
  }
  if (!Array.isArray(raw.nodes)) return null

  const nodes: ParsedNode[] = []
  for (const item of raw.nodes) {
    if (!item || typeof item !== 'object') continue
    const n = item as Record<string, unknown>
    if (typeof n.id !== 'string' || !n.id) continue
    nodes.push({
      id: n.id,
      type: typeof n.type === 'string' ? n.type : 'file',
      name: typeof n.name === 'string' && n.name.trim() ? n.name.trim() : n.id,
      filePath: typeof n.filePath === 'string' && n.filePath.trim() ? normalizeGraphPath(n.filePath) : null,
      summary: typeof n.summary === 'string' ? n.summary.trim() : '',
      tags: Array.isArray(n.tags) ? n.tags.filter((t): t is string => typeof t === 'string') : []
    })
  }

  const edges: ParsedEdge[] = []
  if (Array.isArray(raw.edges)) {
    for (const item of raw.edges) {
      if (!item || typeof item !== 'object') continue
      const e = item as Record<string, unknown>
      if (typeof e.source !== 'string' || typeof e.target !== 'string') continue
      edges.push({
        source: e.source,
        target: e.target,
        type: typeof e.type === 'string' ? e.type : 'depends_on',
        direction: typeof e.direction === 'string' ? e.direction : 'forward'
      })
    }
  }

  const layers: ParsedLayer[] = []
  if (Array.isArray(raw.layers)) {
    for (const item of raw.layers) {
      if (!item || typeof item !== 'object') continue
      const l = item as Record<string, unknown>
      if (typeof l.id !== 'string' || typeof l.name !== 'string') continue
      layers.push({
        id: l.id,
        name: l.name.trim(),
        nodeIds: Array.isArray(l.nodeIds) ? l.nodeIds.filter((id): id is string => typeof id === 'string') : []
      })
    }
  }

  return { graphRel, nodes, edges, layers }
}

/** 从需求标题/正文中提取英文标识符词根与中文二元/短语词元 */
export function extractSearchTokens(text: string): { token: string; weight: number }[] {
  const weights = new Map<string, number>()
  const add = (raw: string, w: number) => {
    const t = raw.toLowerCase().trim()
    if (t.length < 2 || ASCII_STOPWORDS.has(t)) return
    weights.set(t, Math.max(weights.get(t) ?? 0, w))
  }

  // 去掉 URL 避免把域名和查询参数拆成噪声词
  const cleaned = text.replace(/https?:\/\/[^\s)>\]]+/gi, ' ')

  for (const match of cleaned.matchAll(/[A-Za-z][A-Za-z0-9_.-]{1,}/g)) {
    const full = match[0]
    add(full, full.length >= 4 ? 3 : 1)
    for (const seg of full.split(/[._-]+/)) {
      add(seg, seg.length >= 4 ? 2 : 1)
      for (const camel of seg.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ')) {
        add(camel, camel.length >= 4 ? 2 : 1)
      }
    }
  }

  for (const match of cleaned.matchAll(/[一-鿿]{2,}/g)) {
    const phrase = match[0]
    if (phrase.length <= 6) add(phrase, 3)
    for (let i = 0; i <= phrase.length - 2; i += 1) {
      add(phrase.slice(i, i + 2), 1)
    }
  }

  return [...weights.entries()].map(([token, weight]) => ({ token, weight }))
}

/**
 * 派单给智能体时，从图谱目录（默认优先 Vault，回退仓库 .ua/）检索与任务最相关的模块摘要及上下游线索
 */
export function buildUaDispatchContext(
  repoPath: string,
  queryText: string,
  maxNodes = 6,
  lookup?: UaGraphLookup
): string | null {
  const graph = loadParsedGraph(repoPath, lookup)
  if (!graph || graph.nodes.length === 0) return null

  const tokens = extractSearchTokens(queryText)
  const layerOfNode = new Map<string, string>()
  for (const layer of graph.layers) {
    for (const id of layer.nodeIds) layerOfNode.set(id, layer.name)
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const bestByKey = new Map<string, { node: ParsedNode; score: number }>()

  if (tokens.length > 0) {
    for (const node of graph.nodes) {
      const nameLower = node.name.toLowerCase()
      const pathLower = (node.filePath ?? '').toLowerCase()
      const tagsLower = node.tags.join(' ').toLowerCase()
      const summaryLower = node.summary.toLowerCase()

      let score = 0
      for (const { token, weight } of tokens) {
        if (nameLower === token) score += 8 * weight
        else if (nameLower.includes(token)) score += 4 * weight
        if (pathLower && pathLower.includes(token)) score += 3 * weight
        if (tagsLower && tagsLower.includes(token)) score += 3 * weight
        if (summaryLower && summaryLower.includes(token)) score += 2 * weight
      }
      if (score <= 0) continue

      const key = node.filePath ?? node.id
      const prev = bestByKey.get(key)
      if (!prev || score > prev.score || (score === prev.score && node.type === 'file')) {
        bestByKey.set(key, { node, score })
      }
    }
  }

  const ranked = [...bestByKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxNodes)
    .map((entry) => entry.node)

  const header = `仓库已有架构图谱 \`${graph.graphRel}\`（${graph.nodes.length} 个节点${graph.layers.length ? `，${graph.layers.length} 个分层` : ''}）`
  if (ranked.length === 0) {
    return `## 代码图谱线索（Understand Anything）\n\n${header}，定位代码与上下游依赖时可优先查阅。`
  }

  // 构建同文件所有节点的 id 集合，方便找跨文件邻居
  const idsByFile = new Map<string, Set<string>>()
  for (const n of graph.nodes) {
    if (!n.filePath) continue
    let set = idsByFile.get(n.filePath)
    if (!set) {
      set = new Set()
      idsByFile.set(n.filePath, set)
    }
    set.add(n.id)
  }

  const lines = ranked.map((node) => {
    const layer = layerOfNode.get(node.id)
    const loc = node.filePath ? `\`${node.filePath}\`` : `**${node.name}**`
    const meta = [node.filePath && node.name !== node.filePath ? node.name : null, layer ?? null].filter(Boolean).join(' · ')
    const head = `- ${loc}${meta ? `（${meta}）` : ''}${node.summary ? `：${node.summary}` : ''}`

    const ownIds = node.filePath ? (idsByFile.get(node.filePath) ?? new Set([node.id])) : new Set([node.id])
    const neighbors = new Set<string>()
    for (const edge of graph.edges) {
      if (edge.type === 'contains') continue
      const srcOwn = ownIds.has(edge.source)
      const tgtOwn = ownIds.has(edge.target)
      if (srcOwn === tgtOwn) continue
      const other = nodeById.get(srcOwn ? edge.target : edge.source)
      if (!other) continue
      const label = other.filePath ? `\`${other.filePath}\`` : other.name
      neighbors.add(label)
      if (neighbors.size >= 3) break
    }
    return neighbors.size > 0 ? `${head}\n  - 关联：${[...neighbors].join('、')}` : head
  })

  return `## 代码图谱线索（Understand Anything）\n\n${header}，以下为按任务描述匹配到的相关模块：\n\n${lines.join('\n')}`
}

/**
 * 基于知识图谱分析一组改动文件的上下游波及范围
 */
export function analyzeUaDiffImpact(
  repoPath: string,
  changedPaths: string[],
  maxImpacted = 12,
  lookup?: UaGraphLookup
): UaDiffImpact | null {
  const uniquePaths: string[] = []
  const seenPaths = new Set<string>()
  for (const p of changedPaths) {
    const norm = normalizeGraphPath(p)
    if (norm && !seenPaths.has(norm)) {
      seenPaths.add(norm)
      uniquePaths.push(norm)
    }
  }
  if (uniquePaths.length === 0) return null

  const graph = loadParsedGraph(repoPath, lookup)
  if (!graph) return null

  const knownFiles = new Set<string>()
  for (const n of graph.nodes) {
    if (n.filePath) knownFiles.add(n.filePath)
  }

  const matchedFiles = uniquePaths.filter((p) => knownFiles.has(p))
  const untrackedFiles = uniquePaths.filter((p) => !knownFiles.has(p))
  const changedSet = new Set(matchedFiles)

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const changedNodeIds = new Set(graph.nodes.filter((n) => n.filePath && changedSet.has(n.filePath)).map((n) => n.id))

  const agg = new Map<
    string,
    {
      node: ParsedNode
      relation: 'caller' | 'callee'
      edgeTypes: Set<string>
      hits: number
    }
  >()

  for (const edge of graph.edges) {
    if (edge.type === 'contains') continue
    const srcChanged = changedNodeIds.has(edge.source)
    const tgtChanged = changedNodeIds.has(edge.target)
    if (srcChanged === tgtChanged) continue

    const extId = srcChanged ? edge.target : edge.source
    const extNode = nodeById.get(extId)
    if (!extNode) continue
    if (extNode.filePath && changedSet.has(extNode.filePath)) continue

    let relation: 'caller' | 'callee'
    if (edge.direction === 'bidirectional') {
      relation = 'caller'
    } else if (edge.direction === 'backward') {
      relation = srcChanged ? 'caller' : 'callee'
    } else {
      relation = !srcChanged && tgtChanged ? 'caller' : 'callee'
    }

    const key = extNode.filePath ?? extNode.id
    const existing = agg.get(key)
    if (!existing) {
      agg.set(key, {
        node: extNode,
        relation,
        edgeTypes: new Set([edge.type]),
        hits: 1
      })
    } else {
      if (relation === 'caller') existing.relation = 'caller'
      existing.edgeTypes.add(edge.type)
      existing.hits += 1
      if (!existing.node.summary && extNode.summary) existing.node = extNode
    }
  }

  const impacted: UaImpactedItem[] = [...agg.values()]
    .sort((a, b) => {
      if (a.relation !== b.relation) return a.relation === 'caller' ? -1 : 1
      if (b.hits !== a.hits) return b.hits - a.hits
      return (a.node.filePath ?? a.node.name).localeCompare(b.node.filePath ?? b.node.name)
    })
    .slice(0, maxImpacted)
    .map(({ node, relation, edgeTypes }) => ({
      id: node.id,
      name: node.name,
      filePath: node.filePath,
      type: node.type,
      summary: node.summary,
      relation,
      edgeTypes: [...edgeTypes]
    }))

  return {
    graphRel: graph.graphRel,
    matchedFiles,
    untrackedFiles,
    impacted
  }
}
