import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { UaPluginInfo } from '../../shared/types'

export const UA_PLUGIN_INSTALL_CMD =
  'claude plugin install understand-anything --marketplace Egonex-AI/Understand-Anything'

/**
 * 检测本机 Claude Code 是否已安装 Understand Anything，以及对应的斜杠命令名：
 * - 通过 `~/.claude/skills/understand` 安装时，命令为 `/understand`
 * - 通过 `claude plugin install` 安装时，插件技能带命名空间 `/understand-anything:understand`
 */
export function detectUaClaudePlugin(homeDir = homedir()): UaPluginInfo {
  const skillFile = join(homeDir, '.claude', 'skills', 'understand', 'SKILL.md')
  if (existsSync(skillFile)) {
    return {
      installed: true,
      claudeUnderstandCmd: '/understand --language zh',
      claudeKnowledgeCmd: '/understand-knowledge .'
    }
  }

  const registryPath = join(homeDir, '.claude', 'plugins', 'installed_plugins.json')
  if (existsSync(registryPath)) {
    try {
      const parsed = JSON.parse(readFileSync(registryPath, 'utf8')) as {
        plugins?: Record<string, Array<{ installPath?: string }>>
      }
      const plugins = parsed?.plugins
      if (plugins && typeof plugins === 'object') {
        for (const [key, entries] of Object.entries(plugins)) {
          if (key !== 'understand-anything' && !key.startsWith('understand-anything@')) continue
          const hasValidPath =
            Array.isArray(entries) &&
            entries.some((entry) => typeof entry?.installPath === 'string' && existsSync(entry.installPath))
          if (hasValidPath) {
            return {
              installed: true,
              claudeUnderstandCmd: '/understand-anything:understand --language zh',
              claudeKnowledgeCmd: '/understand-anything:understand-knowledge .'
            }
          }
        }
      }
    } catch {
      // ignore corrupted plugin registry
    }
  }

  return {
    installed: false,
    claudeUnderstandCmd: '/understand-anything:understand --language zh',
    claudeKnowledgeCmd: '/understand-anything:understand-knowledge .'
  }
}
