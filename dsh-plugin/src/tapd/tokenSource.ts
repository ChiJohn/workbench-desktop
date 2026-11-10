import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface McpConfig {
  mcpServers?: Record<string, { env?: Record<string, string> }>
}

function decode(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  return buf.toString('utf8').replace(/^﻿/, '')
}

/** 尝试从环境变量或 Cursor 的 mcp.json 获取 TAPD 访问令牌 */
export function resolveTapdToken(explicitToken?: string): string | undefined {
  if (explicitToken && explicitToken.trim()) return explicitToken.trim()
  if (process.env.TAPD_ACCESS_TOKEN && process.env.TAPD_ACCESS_TOKEN.trim()) {
    return process.env.TAPD_ACCESS_TOKEN.trim()
  }

  const mcpPath = join(homedir(), '.cursor', 'mcp.json')
  if (existsSync(mcpPath)) {
    try {
      const config = JSON.parse(decode(readFileSync(mcpPath))) as McpConfig
      const servers = config.mcpServers ?? {}
      const preferred = servers['mcp-server-tapd']?.env?.TAPD_ACCESS_TOKEN
      if (preferred && preferred.trim()) return preferred.trim()
      const anyMatch = Object.values(servers).find((s) => s.env?.TAPD_ACCESS_TOKEN)?.env?.TAPD_ACCESS_TOKEN
      if (anyMatch && anyMatch.trim()) return anyMatch.trim()
    } catch {
      // 忽略解析错误
    }
  }

  return undefined
}
