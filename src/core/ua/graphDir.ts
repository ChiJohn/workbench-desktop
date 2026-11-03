import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UaDataDirName, UaGraphSummary } from '../../shared/types'

export type { UaDataDirName, UaGraphSummary }

export interface UaGraphInfo {
  dataDir: UaDataDirName
  graphRel: string
}

/** 仓库里是否已有 Understand Anything 提交过的图谱 */
export function findUaGraph(repoPath: string): UaGraphInfo | null {
  for (const dir of ['.ua', '.understand-anything'] as const) {
    const graph = join(repoPath, dir, 'knowledge-graph.json')
    if (existsSync(graph)) return { dataDir: dir, graphRel: `${dir}/knowledge-graph.json` }
  }
  return null
}

function cleanStr(val: unknown): string | null {
  return typeof val === 'string' && val.trim() ? val.trim() : null
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 从指定的图谱数据目录（如 vault/项目/xxx/.ua 或 repo/.ua）读取统计信息 */
export function readUaGraphSummaryFromDir(graphDir: string): UaGraphSummary | null {
  const graph = readJson(join(graphDir, 'knowledge-graph.json')) ?? readJson(join(graphDir, 'domain-graph.json'))
  if (!graph) return null

  const project =
    graph.project && typeof graph.project === 'object' && !Array.isArray(graph.project)
      ? (graph.project as Record<string, unknown>)
      : null
  const meta = readJson(join(graphDir, 'meta.json'))

  return {
    analyzedAt: cleanStr(project?.analyzedAt) ?? cleanStr(meta?.lastAnalyzedAt),
    gitCommitHash: cleanStr(project?.gitCommitHash) ?? cleanStr(meta?.gitCommitHash),
    description: cleanStr(project?.description),
    nodeCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
    edgeCount: Array.isArray(graph.edges) ? graph.edges.length : 0,
    layerCount: Array.isArray(graph.layers) ? graph.layers.length : 0,
    tourCount: Array.isArray(graph.tour) ? graph.tour.length : 0,
    hasDomainGraph: existsSync(join(graphDir, 'domain-graph.json'))
  }
}

/** 读取 knowledge-graph.json 与 meta.json 的核心统计信息；损坏或缺失时返回 null */
export function readUaGraphSummary(repoPath: string, dataDir?: UaDataDirName): UaGraphSummary | null {
  const dir = dataDir ?? findUaGraph(repoPath)?.dataDir
  if (!dir) return null
  return readUaGraphSummaryFromDir(join(repoPath, dir))
}

export { isUaGraphStale } from './viewerUrl'

