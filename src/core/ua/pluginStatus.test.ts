import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectUaClaudePlugin } from './pluginStatus'

describe('detectUaClaudePlugin', () => {
  it('returns installed=false when neither skills nor plugin exist', () => {
    const home = mkdtempSync(join(tmpdir(), 'wb-ua-home-'))
    try {
      expect(detectUaClaudePlugin(home)).toEqual({
        installed: false,
        claudeUnderstandCmd: '/understand-anything:understand --language zh',
        claudeKnowledgeCmd: '/understand-anything:understand-knowledge .'
      })
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('detects standalone ~/.claude/skills/understand installation', () => {
    const home = mkdtempSync(join(tmpdir(), 'wb-ua-home-'))
    try {
      const skillDir = join(home, '.claude', 'skills', 'understand')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: understand\n---')
      expect(detectUaClaudePlugin(home)).toEqual({
        installed: true,
        claudeUnderstandCmd: '/understand --language zh',
        claudeKnowledgeCmd: '/understand-knowledge .'
      })
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('detects marketplace plugin installation with namespaced command', () => {
    const home = mkdtempSync(join(tmpdir(), 'wb-ua-home-'))
    try {
      const pluginsDir = join(home, '.claude', 'plugins')
      const cacheDir = join(pluginsDir, 'cache', 'understand-anything', '2.9.8')
      mkdirSync(cacheDir, { recursive: true })
      writeFileSync(
        join(pluginsDir, 'installed_plugins.json'),
        JSON.stringify({
          version: 2,
          plugins: {
            'understand-anything@understand-anything': [{ installPath: cacheDir }]
          }
        })
      )
      expect(detectUaClaudePlugin(home)).toEqual({
        installed: true,
        claudeUnderstandCmd: '/understand-anything:understand --language zh',
        claudeKnowledgeCmd: '/understand-anything:understand-knowledge .'
      })
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
