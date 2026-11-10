import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 自动解析 Apifox 访问令牌：
 * 1. 显式传入的令牌
 * 2. 环境变量 APIFOX_ACCESS_TOKEN 或 APIFOX_TOKEN
 * 3. 本地 Cursor / MCP 配置文件 (~/.cursor/mcp.json) 中的配置
 */
export function resolveApifoxToken(explicitToken?: string): string | undefined {
  if (explicitToken && explicitToken.trim()) {
    return explicitToken.trim()
  }

  if (process.env.APIFOX_ACCESS_TOKEN && process.env.APIFOX_ACCESS_TOKEN.trim()) {
    return process.env.APIFOX_ACCESS_TOKEN.trim()
  }
  if (process.env.APIFOX_TOKEN && process.env.APIFOX_TOKEN.trim()) {
    return process.env.APIFOX_TOKEN.trim()
  }

  const mcpPath = join(homedir(), '.cursor', 'mcp.json')
  if (existsSync(mcpPath)) {
    try {
      const buffer = readFileSync(mcpPath)
      let text = buffer.toString('utf8')
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1)
      } else if (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || buffer[1] === 0x00)) {
        text = buffer.toString('utf16le')
      }
      const data = JSON.parse(text)
      const servers = data?.mcpServers || {}
      for (const key of Object.keys(servers)) {
        const env = servers[key]?.env || {}
        if (env.APIFOX_ACCESS_TOKEN) return String(env.APIFOX_ACCESS_TOKEN).trim()
        if (env.APIFOX_TOKEN) return String(env.APIFOX_TOKEN).trim()
      }
    } catch {
      // 容错忽略
    }
  }

  return undefined
}
