import { readFileSync } from 'node:fs'

interface McpConfig {
  mcpServers?: Record<string, { env?: Record<string, string> }>
}

/** PowerShell 写出的 JSON 常见为 UTF-16 LE 带 BOM */
function decode(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  return buf.toString('utf8').replace(/^\uFEFF/, '')
}

/** 从 Cursor 的 mcp.json 中找 mcp-server-tapd 的令牌 */
export function readMcpToken(file: string): string | undefined {
  try {
    const config = JSON.parse(decode(readFileSync(file))) as McpConfig
    const servers = config.mcpServers ?? {}
    const preferred = servers['mcp-server-tapd']?.env?.TAPD_ACCESS_TOKEN
    if (preferred) return preferred
    return Object.values(servers).find((s) => s.env?.TAPD_ACCESS_TOKEN)?.env?.TAPD_ACCESS_TOKEN
  } catch {
    return undefined
  }
}
