import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzeUaDiffImpact, buildUaDispatchContext } from './graphContext'

function makeRepoWithGraph(graph: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-ua-ctx-'))
  mkdirSync(join(root, '.ua'))
  writeFileSync(join(root, '.ua', 'knowledge-graph.json'), JSON.stringify(graph))
  return root
}

const SAMPLE_GRAPH = {
  version: '2.0',
  project: {
    name: 'sample',
    languages: ['typescript'],
    frameworks: ['react'],
    description: 'sample app',
    analyzedAt: '2026-10-30T10:00:00.000Z',
    gitCommitHash: 'abc1234'
  },
  nodes: [
    {
      id: 'n-release',
      type: 'class',
      name: 'ReleaseService',
      filePath: 'src/core/release/releaseService.ts',
      summary: '小程序构建、预览二维码与上传体验版流水线',
      tags: ['release', 'miniapp', 'qrcode']
    },
    {
      id: 'n-qr',
      type: 'function',
      name: 'readQrDataUrl',
      filePath: 'src/core/release/qrDataUrl.ts',
      summary: '读取微信 CLI 生成的二维码图片并转为 DataURL',
      tags: ['qrcode']
    },
    {
      id: 'n-ipc',
      type: 'file',
      name: 'ipc.ts',
      filePath: 'src/main/ipc.ts',
      summary: '注册主进程所有 IPC 通道',
      tags: ['ipc', 'electron']
    },
    {
      id: 'n-card',
      type: 'component',
      name: 'ReleaseCard',
      filePath: 'src/renderer/src/components/ReleaseCard.tsx',
      summary: '渲染小程序发版卡片与预览二维码弹窗',
      tags: ['ui', 'release']
    }
  ],
  edges: [
    { source: 'n-ipc', target: 'n-release', type: 'calls', direction: 'forward', weight: 1 },
    { source: 'n-release', target: 'n-qr', type: 'calls', direction: 'forward', weight: 1 },
    { source: 'n-card', target: 'n-ipc', type: 'calls', direction: 'forward', weight: 1 }
  ],
  layers: [
    { id: 'l-core', name: '业务核心层', description: '', nodeIds: ['n-release', 'n-qr'] },
    { id: 'l-main', name: '主进程层', description: '', nodeIds: ['n-ipc'] },
    { id: 'l-ui', name: '渲染层', description: '', nodeIds: ['n-card'] }
  ],
  tour: []
}

describe('buildUaDispatchContext', () => {
  it('matches relevant modules and their neighbors for Chinese and English queries', () => {
    const root = makeRepoWithGraph(SAMPLE_GRAPH)
    try {
      const ctx = buildUaDispatchContext(root, '修复小程序预览二维码显示失败的问题 ReleaseService')
      expect(ctx).toContain('## 代码图谱线索（Understand Anything）')
      expect(ctx).toContain('`src/core/release/releaseService.ts`')
      expect(ctx).toContain('业务核心层')
      expect(ctx).toContain('关联：')
      expect(ctx).toContain('`src/main/ipc.ts`')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('still emits a lightweight graph pointer when no keywords match', () => {
    const root = makeRepoWithGraph(SAMPLE_GRAPH)
    try {
      const ctx = buildUaDispatchContext(root, 'zzzzzz_unrelated_token')
      expect(ctx).toContain('.ua/knowledge-graph.json')
      expect(ctx).toContain('4 个节点')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns null when repo has no UA graph', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-ua-empty-'))
    try {
      expect(buildUaDispatchContext(root, '二维码')).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('analyzeUaDiffImpact', () => {
  it('identifies upstream callers and downstream callees along with untracked files', () => {
    const root = makeRepoWithGraph(SAMPLE_GRAPH)
    try {
      const impact = analyzeUaDiffImpact(root, ['src\\core\\release\\releaseService.ts', 'src/new/helper.ts'])
      expect(impact).not.toBeNull()
      expect(impact?.matchedFiles).toEqual(['src/core/release/releaseService.ts'])
      expect(impact?.untrackedFiles).toEqual(['src/new/helper.ts'])
      expect(impact?.impacted).toEqual([
        {
          id: 'n-ipc',
          name: 'ipc.ts',
          filePath: 'src/main/ipc.ts',
          type: 'file',
          summary: '注册主进程所有 IPC 通道',
          relation: 'caller',
          edgeTypes: ['calls']
        },
        {
          id: 'n-qr',
          name: 'readQrDataUrl',
          filePath: 'src/core/release/qrDataUrl.ts',
          type: 'function',
          summary: '读取微信 CLI 生成的二维码图片并转为 DataURL',
          relation: 'callee',
          edgeTypes: ['calls']
        }
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
