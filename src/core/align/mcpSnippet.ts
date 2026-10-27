import { AppError } from '../result'

/** 给用户自己粘贴到 Cursor 的 mcp.json。片段里不含令牌 */
export function mcpSnippet(projectId: string): string {
  const id = projectId.trim()
  if (!/^\d+$/.test(id)) throw new AppError('ALIGN_LINK', 'Apifox 项目号是一串数字，在 Apifox 的项目设置里复制')
  return JSON.stringify(
    {
      mcpServers: {
        [`Apifox ${id}`]: {
          command: 'cmd',
          args: ['/c', 'npx', '-y', 'apifox-mcp-server@latest', `--project=${id}`]
        }
      }
    },
    null,
    2
  )
}
