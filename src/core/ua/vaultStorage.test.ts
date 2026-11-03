import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  projectVaultUaRel,
  resolveProjectUaLocation,
  stageVaultUaToRepo,
  syncRepoUaToVault
} from './vaultStorage'

describe('vaultStorage', () => {
  it('derives vault .ua path from obsidianLink or project name', () => {
    expect(projectVaultUaRel({ name: 'lv-charge', obsidianLink: '项目/驴充充充电小程序/主页' })).toBe(
      '项目/驴充充充电小程序/.ua'
    )
    expect(projectVaultUaRel({ name: 'demo', obsidianLink: '主页' })).toBe('项目/demo/.ua')
  })

  it('syncs persisted files to vault, skips scratch dirs, and cleans repo .ua', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-ua-vault-'))
    const repo = join(root, 'repo')
    const vault = join(root, 'vault')
    try {
      mkdirSync(join(repo, '.ua', 'intermediate'), { recursive: true })
      writeFileSync(join(repo, '.ua', 'knowledge-graph.json'), '{"nodes":[]}')
      writeFileSync(join(repo, '.ua', 'config.json'), '{"outputLanguage":"zh"}')
      writeFileSync(join(repo, '.ua', 'diff-overlay.json'), '{}')
      writeFileSync(join(repo, '.ua', 'intermediate', 'batch-1.json'), '{}')

      const vaultUa = join(vault, '项目', 'demo', '.ua')
      const res = syncRepoUaToVault(repo, vaultUa)
      expect(res.cleanedRepo).toBe(true)
      expect(res.movedFiles.sort()).toEqual(['config.json', 'knowledge-graph.json'])
      expect(existsSync(join(repo, '.ua'))).toBe(false)
      expect(existsSync(join(vaultUa, 'knowledge-graph.json'))).toBe(true)
      expect(existsSync(join(vaultUa, 'diff-overlay.json'))).toBe(false)
      expect(existsSync(join(vaultUa, 'intermediate'))).toBe(false)

      const loc = resolveProjectUaLocation(vault, {
        name: 'demo',
        obsidianLink: '项目/demo/主页',
        repoPath: repo
      })
      expect(loc.hasGraph).toBe(true)
      expect(loc.location).toBe('vault')
      expect(loc.hasRepoResidue).toBe(false)
      expect(loc.graphRel).toBe('项目/demo/.ua/knowledge-graph.json')

      // Stage back to repo for incremental run
      const staged = stageVaultUaToRepo(vaultUa, repo)
      expect(staged.sort()).toEqual(['config.json', 'knowledge-graph.json'])
      expect(readFileSync(join(repo, '.ua', 'config.json'), 'utf8')).toContain('"zh"')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
