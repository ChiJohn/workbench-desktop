import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import type { Project, UaDataDirName, UaGraphLocation } from '../../shared/types'
import { projectFolder } from '../tasks/taskCard'
import { findUaGraph } from './graphDir'

const PERSISTED_EXACT = new Set([
  'knowledge-graph.json',
  'domain-graph.json',
  'meta.json',
  'fingerprints.json',
  'config.json',
  '.understandignore'
])

export function isPersistedUaFile(name: string): boolean {
  if (PERSISTED_EXACT.has(name)) return true
  if (name === 'diff-overlay.json') return false
  return /knowledge-graph.*\.json$/i.test(name)
}

function safeSegment(raw: string): string {
  return (
    raw
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/^\.+|\.+$/g, '')
      .trim() || '未命名项目'
  )
}

/** 项目在 Vault 中存放 UA 图谱的相对目录，如 `项目/lv-charge/.ua` */
export function projectVaultUaRel(project: Pick<Project, 'name' | 'obsidianLink'>): string {
  const folder = projectFolder(project.obsidianLink)
  const rawParts = folder.split('/').filter(Boolean)
  const parts =
    rawParts.length > 1
      ? rawParts.map(safeSegment)
      : ['项目', safeSegment(project.name)]
  return `${parts.join('/')}/.ua`
}

export function projectVaultUaDir(
  vaultPath: string | null | undefined,
  project: Pick<Project, 'name' | 'obsidianLink'>
): { dir: string; rel: string } | null {
  const trimmed = vaultPath?.trim()
  if (!trimmed) return null
  const root = resolve(trimmed)
  const rel = projectVaultUaRel(project)
  const dir = resolve(root, ...rel.split('/'))
  if (!dir.startsWith(root + sep)) return null
  return { dir, rel }
}

export interface ResolvedUaLocation {
  hasGraph: boolean
  location: UaGraphLocation | null
  dataDir: UaDataDirName | null
  graphDir: string | null
  graphRel: string | null
  vaultDir: string | null
  vaultRel: string | null
  hasRepoResidue: boolean
}

/**
 * 优先从 Obsidian Vault（`项目/<名称>/.ua/`）定位项目的 UA 图谱；
 * 若 Vault 中尚无图谱，则回退检查项目仓库内的 `.ua/`（便于一键迁入 Vault）。
 */
export function resolveProjectUaLocation(
  vaultPath: string | null | undefined,
  project: Pick<Project, 'name' | 'obsidianLink' | 'repoPath'>
): ResolvedUaLocation {
  const hasRepoResidue =
    existsSync(join(project.repoPath, '.ua')) || existsSync(join(project.repoPath, '.understand-anything'))
  const vaultTarget = vaultPath && existsSync(vaultPath) ? projectVaultUaDir(vaultPath, project) : null

  if (vaultTarget && existsSync(join(vaultTarget.dir, 'knowledge-graph.json'))) {
    return {
      hasGraph: true,
      location: 'vault',
      dataDir: '.ua',
      graphDir: vaultTarget.dir,
      graphRel: `${vaultTarget.rel}/knowledge-graph.json`,
      vaultDir: vaultTarget.dir,
      vaultRel: vaultTarget.rel,
      hasRepoResidue
    }
  }

  const repoGraph = findUaGraph(project.repoPath)
  if (repoGraph) {
    return {
      hasGraph: true,
      location: 'repo',
      dataDir: repoGraph.dataDir,
      graphDir: join(project.repoPath, repoGraph.dataDir),
      graphRel: `仓库内 ${repoGraph.graphRel}`,
      vaultDir: vaultTarget?.dir ?? null,
      vaultRel: vaultTarget?.rel ?? null,
      hasRepoResidue: true
    }
  }

  return {
    hasGraph: false,
    location: null,
    dataDir: null,
    graphDir: null,
    graphRel: vaultTarget ? `${vaultTarget.rel}/knowledge-graph.json` : null,
    vaultDir: vaultTarget?.dir ?? null,
    vaultRel: vaultTarget?.rel ?? null,
    hasRepoResidue
  }
}

/**
 * 运行 `/understand` 前，将 Vault 中已有的持久化图谱与指纹临时铺回 `repoPath/.ua`，
 * 使 `/understand` 能执行增量分析而不必每次全量重扫。
 */
export function stageVaultUaToRepo(vaultUaDir: string, repoPath: string): string[] {
  if (!existsSync(vaultUaDir)) return []
  const entries = readdirSync(vaultUaDir).filter((name) => {
    if (!isPersistedUaFile(name)) return false
    try {
      return statSync(join(vaultUaDir, name)).isFile()
    } catch {
      return false
    }
  })
  if (entries.length === 0) return []

  const dstDir = join(repoPath, '.ua')
  mkdirSync(dstDir, { recursive: true })
  for (const name of entries) {
    copyFileSync(join(vaultUaDir, name), join(dstDir, name))
  }
  return entries
}

/**
 * 将 `repoPath/.ua`（或旧版 `.understand-anything`）中的有效产物同步到 Vault，
 * 并彻底删除仓库目录下的 `.ua`，保持项目工作区干净。
 */
export function syncRepoUaToVault(
  repoPath: string,
  vaultUaDir: string
): { movedFiles: string[]; cleanedRepo: boolean } {
  const movedFiles: string[] = []
  let cleanedRepo = false

  for (const sub of ['.ua', '.understand-anything'] as const) {
    const srcDir = join(repoPath, sub)
    if (!existsSync(srcDir)) continue
    const files = readdirSync(srcDir).filter((name) => {
      if (!isPersistedUaFile(name)) return false
      try {
        return statSync(join(srcDir, name)).isFile()
      } catch {
        return false
      }
    })
    if (files.length > 0) {
      mkdirSync(vaultUaDir, { recursive: true })
      for (const name of files) {
        copyFileSync(join(srcDir, name), join(vaultUaDir, name))
        if (!movedFiles.includes(name)) movedFiles.push(name)
      }
    }
    rmSync(srcDir, { recursive: true, force: true })
    cleanedRepo = true
  }

  return { movedFiles, cleanedRepo }
}

const HELPER_SOURCE = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [repoPath, vaultUaDir] = process.argv.slice(2);
if (!repoPath || !vaultUaDir) process.exit(0);

const EXACT = new Set([
  'knowledge-graph.json',
  'domain-graph.json',
  'meta.json',
  'fingerprints.json',
  'config.json',
  '.understandignore',
]);
const keep = (name) => EXACT.has(name) || (name !== 'diff-overlay.json' && /knowledge-graph.*\\.json$/i.test(name));

let moved = 0;
let cleaned = false;
for (const sub of ['.ua', '.understand-anything']) {
  const srcDir = path.join(repoPath, sub);
  if (!fs.existsSync(srcDir)) continue;
  for (const name of fs.readdirSync(srcDir)) {
    if (!keep(name)) continue;
    const sp = path.join(srcDir, name);
    if (!fs.statSync(sp).isFile()) continue;
    fs.mkdirSync(vaultUaDir, { recursive: true });
    fs.copyFileSync(sp, path.join(vaultUaDir, name));
    moved += 1;
  }
  fs.rmSync(srcDir, { recursive: true, force: true });
  cleaned = true;
}
if (moved > 0 || cleaned) {
  console.log('\\n[Workbench] 已将 UA 图谱文件收纳至 Vault：' + vaultUaDir + '（并已清理仓库 .ua 目录）');
}
`

export function ensureUaSyncHelper(tempRoot = tmpdir()): string {
  const file = join(tempRoot, 'wb-ua-vault-sync.mjs')
  writeFileSync(file, HELPER_SOURCE, 'utf8')
  return file
}

export function buildUaTerminalLine(opts: {
  claudeCmd: string
  helperPath: string
  repoPath: string
  vaultUaDir: string
}): string {
  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`
  return `claude ${q(opts.claudeCmd)}; node ${q(opts.helperPath)} ${q(opts.repoPath)} ${q(opts.vaultUaDir)}`
}
