import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { findUaGraph, isUaGraphStale, readUaGraphSummary } from './graphDir'

describe('findUaGraph', () => {
  it('prefers .ua when knowledge-graph.json exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-ua-'))
    try {
      mkdirSync(join(root, '.ua'))
      writeFileSync(join(root, '.ua', 'knowledge-graph.json'), '{}')
      expect(findUaGraph(root)).toEqual({ dataDir: '.ua', graphRel: '.ua/knowledge-graph.json' })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('falls back to legacy .understand-anything', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-ua-'))
    try {
      mkdirSync(join(root, '.understand-anything'))
      writeFileSync(join(root, '.understand-anything', 'knowledge-graph.json'), '{}')
      expect(findUaGraph(root)).toEqual({
        dataDir: '.understand-anything',
        graphRel: '.understand-anything/knowledge-graph.json'
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns null without a graph file', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-ua-'))
    try {
      mkdirSync(join(root, '.ua'))
      expect(findUaGraph(root)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('readUaGraphSummary', () => {
  it('extracts counts, project metadata, and domain graph presence', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-ua-'))
    try {
      mkdirSync(join(root, '.ua'))
      writeFileSync(
        join(root, '.ua', 'knowledge-graph.json'),
        JSON.stringify({
          project: {
            name: 'demo',
            description: '示例项目图谱',
            analyzedAt: '2026-10-30T10:00:00.000Z',
            gitCommitHash: 'f11263b9999999'
          },
          nodes: [{ id: 'n1' }, { id: 'n2' }],
          edges: [{ source: 'n1', target: 'n2' }],
          layers: [{ id: 'l1' }],
          tour: [{ order: 1 }, { order: 2 }]
        })
      )
      writeFileSync(join(root, '.ua', 'domain-graph.json'), '{}')
      expect(readUaGraphSummary(root)).toEqual({
        analyzedAt: '2026-10-30T10:00:00.000Z',
        gitCommitHash: 'f11263b9999999',
        description: '示例项目图谱',
        nodeCount: 2,
        edgeCount: 1,
        layerCount: 1,
        tourCount: 2,
        hasDomainGraph: true
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('falls back to meta.json when project fields are absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-ua-'))
    try {
      mkdirSync(join(root, '.ua'))
      writeFileSync(join(root, '.ua', 'knowledge-graph.json'), JSON.stringify({ nodes: [] }))
      writeFileSync(
        join(root, '.ua', 'meta.json'),
        JSON.stringify({ lastAnalyzedAt: '2026-10-29T08:00:00.000Z', gitCommitHash: 'abc1234' })
      )
      expect(readUaGraphSummary(root)).toEqual({
        analyzedAt: '2026-10-29T08:00:00.000Z',
        gitCommitHash: 'abc1234',
        description: null,
        nodeCount: 0,
        edgeCount: 0,
        layerCount: 0,
        tourCount: 0,
        hasDomainGraph: false
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('isUaGraphStale', () => {
  it('matches short hash prefix against full commit hash', () => {
    expect(isUaGraphStale('f11263b987654321', 'f11263b')).toBe(false)
    expect(isUaGraphStale('f11263b', 'f11263b987654321')).toBe(false)
    expect(isUaGraphStale('f11263b', '5d3402d')).toBe(true)
    expect(isUaGraphStale(null, 'f11263b')).toBe(false)
  })
})

