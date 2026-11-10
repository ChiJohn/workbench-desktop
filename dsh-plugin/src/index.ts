/**
 * DeepSeek Harness Workbench Extension: TAPD Agile Management, MiniApp Release, and Developer Toolkit.
 *
 * Exposes model-facing tools for:
 * - `tapd_list_tasks`: List assigned stories, bugs, and tasks across TAPD workspaces.
 * - `tapd_get_task_detail`: Inspect full task description, requirements, and allowed status transitions.
 * - `tapd_update_task_status`: Update task/bug status and record comments.
 * - `miniapp_detect_env`: Detect WeChat MiniProgram project configurations, build scripts, and CLI path.
 * - `miniapp_preview`: Trigger MiniProgram build and generate preview QR code.
 * - `miniapp_upload`: Build and upload MiniProgram version with description to WeChat platform.
 * - `apifox_get_contract`: Fetch and parse Apifox OpenAPI contract with parameter table & TypeScript interfaces.
 * - `workbench_get_work_summary`: Aggregate Git commits and TAPD completed items into structured summary for daily/weekly reports.
 *
 * @module @deepseek-ai/dsh-workbench
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { TapdClient } from './tapd/tapdClient.js'
import { TapdService } from './tapd/tapdService.js'
import { resolveTapdToken } from './tapd/tokenSource.js'
import { detectReleaseEnv, runPreview, runUpload } from './release/releaseService.js'
import { ApifoxClient } from './align/apifoxClient.js'
import { classifyLink } from './align/links.js'
import { renderContract } from './align/contract.js'
import { resolveApifoxToken } from './align/tokenSource.js'
import { collectWorkSummary } from './report/summaryService.js'
import { listProjects } from './registry/projectRegistry.js'
import { AppError } from './util/result.js'

export const name = 'workbench'
export const inject = ['tools']

export interface Config {
  /** TAPD API 访问令牌。如未提供，将自动读取环境变量 TAPD_ACCESS_TOKEN 或 ~/.cursor/mcp.json 中的令牌 */
  token?: string | undefined
  /** 自定义 TAPD API 地址，默认为 https://api.tapd.cn */
  baseUrl?: string | undefined
  /** 微信开发者工具 cli.bat 路径，未配置时将自动扫描注册表和默认安装目录 */
  wechatCli?: string | undefined
  /** Apifox 访问令牌。如未提供，将自动读取环境变量 APIFOX_ACCESS_TOKEN 或 ~/.cursor/mcp.json 中的令牌 */
  apifoxToken?: string | undefined
  /** 项目映射表「项目.md」文件路径，未提供时将自动寻找 Obsidian Vault 或桌面端配置 */
  projectMapPath?: string | undefined
  /** Obsidian Vault 笔记库根目录 */
  vaultPath?: string | undefined
}

export const Config: z<Config> = z.object({
  token: z.string().description('TAPD Personal Access Token'),
  baseUrl: z.string().default('https://api.tapd.cn'),
  wechatCli: z.string().description('Path to WeChat Web Developer Tools cli.bat'),
  apifoxToken: z.string().description('Apifox Personal Access Token'),
  projectMapPath: z.string().description('Path to 项目.md repo mapping file'),
  vaultPath: z.string().description('Path to Obsidian notes Vault')
}) as unknown as z<Config>

export function apply(ctx: Context, config: Config): void {
  const tokenGetter = () => resolveTapdToken(config.token)

  const client = new TapdClient({
    token: tokenGetter,
    baseUrl: config.baseUrl || 'https://api.tapd.cn'
  })

  const service = new TapdService(client)

  const apifoxClient = new ApifoxClient({
    token: () => resolveApifoxToken(config.apifoxToken)
  })

  // 1. tapd_list_tasks
  ctx.tools.register(
    defineTool({
      name: 'tapd_list_tasks',
      description:
        'List TAPD requirements (stories), bugs, and tasks assigned to the current user across project workspaces. ' +
        'Returns summary info including key, title, status, priority, and web link.',
      parameters: {
        kind: {
          type: 'string',
          enum: ['all', 'story', 'bug', 'task'],
          description: 'Filter by item kind: all, story, bug, or task. Defaults to all.'
        },
        workspace: {
          type: 'string',
          description: 'Optional filter by workspace name or workspace ID substring.'
        },
        force_refresh: {
          type: 'boolean',
          description: 'Whether to bypass cache and force refresh from TAPD. Defaults to false.'
        }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            user: { type: 'string', required: true },
            total: { type: 'integer', required: true },
            items: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  key: { type: 'string', required: true },
                  kind: { type: 'string', required: true },
                  id: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  status: { type: 'string', required: true },
                  statusLabel: { type: 'string', required: true },
                  workspaceName: { type: 'string', required: true },
                  priority: { type: 'string' },
                  modified: { type: 'string', required: true },
                  url: { type: 'string', required: true }
                }
              }
            }
          }
        },
        render: (_args, value): ContentBlock[] => {
          if (value.items.length === 0) {
            return [{ type: 'text', text: `用户「${value.user}」名下暂无待办 TAPD 任务。` }]
          }
          const lines = [
            `当前 TAPD 用户: ${value.user}（共 ${value.total} 项待办）:`,
            ...value.items.map(
              (i) =>
                `- [${i.key}] [${i.workspaceName}] [${i.statusLabel}] ${i.title} (${i.priority ? `${i.priority}, ` : ''}${i.modified})\n  链接: ${i.url}`
            )
          ]
          return [{ type: 'text', text: lines.join('\n') }]
        }
      },
      async execute(args) {
        const board = await service.board(args.force_refresh === true)
        let filtered = board.items

        if (args.kind && args.kind !== 'all') {
          filtered = filtered.filter((i) => i.kind === args.kind)
        }
        if (args.workspace && args.workspace.trim()) {
          const wsQuery = args.workspace.trim().toLowerCase()
          filtered = filtered.filter(
            (i) =>
              i.workspaceName.toLowerCase().includes(wsQuery) ||
              i.workspaceId.toLowerCase().includes(wsQuery)
          )
        }

        return {
          user: board.user,
          total: filtered.length,
          items: filtered.map((i) => ({
            key: i.key,
            kind: i.kind,
            id: i.id,
            title: i.title,
            status: i.status,
            statusLabel: i.statusLabel,
            workspaceName: i.workspaceName,
            ...(i.priority ? { priority: i.priority } : {}),
            modified: i.modified,
            url: i.url
          }))
        }
      }
    })
  )

  // 2. tapd_get_task_detail
  ctx.tools.register(
    defineTool({
      name: 'tapd_get_task_detail',
      description:
        'Get full details of a specific TAPD requirement (story), bug, or task, including its complete rich-text description/reproduction steps and valid next workflow statuses.',
      parameters: {
        key: {
          type: 'string',
          required: true,
          description: 'The TAPD item key (e.g., "story:1016729", "bug:1016730") or numeric ID.'
        }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', required: true },
            kind: { type: 'string', required: true },
            id: { type: 'string', required: true },
            title: { type: 'string', required: true },
            workspaceName: { type: 'string', required: true },
            status: { type: 'string', required: true },
            statusLabel: { type: 'string', required: true },
            owners: { type: 'array', required: true, items: { type: 'string' } },
            description: { type: 'string', required: true },
            url: { type: 'string', required: true },
            allowedTransitions: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  to: { type: 'string', required: true },
                  label: { type: 'string', required: true },
                  blockedBy: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        },
        render: (_args, value): ContentBlock[] => {
          const transitions =
            value.allowedTransitions.length > 0
              ? value.allowedTransitions
                  .map((t) => (t.blockedBy?.length ? `${t.label} (需要网页填写: ${t.blockedBy.join(',')})` : t.label))
                  .join(' | ')
              : '无可用流转'

          const text = [
            `【${value.kind.toUpperCase()}】${value.title}`,
            `单号: ${value.key} | 空间: ${value.workspaceName} | 当前状态: ${value.statusLabel} | 处理人: ${value.owners.join(', ')}`,
            `链接: ${value.url}`,
            `可流转状态: ${transitions}`,
            '---',
            '详细描述与需求/复现步骤:',
            value.description || '(无详细描述)'
          ].join('\n')

          return [{ type: 'text', text }]
        }
      },
      async execute(args) {
        const detail = await service.detail(args.key)
        return {
          key: detail.item.key,
          kind: detail.item.kind,
          id: detail.item.id,
          title: detail.item.title,
          workspaceName: detail.item.workspaceName,
          status: detail.item.status,
          statusLabel: detail.item.statusLabel,
          owners: detail.item.owners,
          description: detail.description,
          url: detail.item.url,
          allowedTransitions: detail.transitions.map((t) => ({
            to: t.to,
            label: t.label,
            blockedBy: t.blockedBy
          }))
        }
      }
    })
  )

  // 3. tapd_update_task_status
  ctx.tools.register(
    defineTool({
      name: 'tapd_update_task_status',
      description:
        'Update the workflow status of a TAPD story, bug, or task, with an optional remark/comment explaining the update or resolution.',
      parameters: {
        key: {
          type: 'string',
          required: true,
          description: 'The TAPD item key (e.g., "story:1016729", "bug:1016730") or numeric ID.'
        },
        status: {
          type: 'string',
          required: true,
          description: 'Target status code or status label (e.g., "resolved", "已解决", "in_progress", "进行中").'
        },
        comment: {
          type: 'string',
          description: 'Optional remark/comment to post to the TAPD item log.'
        }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            success: { type: 'boolean', required: true },
            key: { type: 'string', required: true },
            title: { type: 'string', required: true },
            newStatus: { type: 'string', required: true },
            newStatusLabel: { type: 'string', required: true },
            commentAdded: { type: 'boolean', required: true }
          }
        },
        render: (_args, value): ContentBlock[] => {
          return [
            {
              type: 'text',
              text: `已成功将「${value.title}」(${value.key}) 状态更新为「${value.newStatusLabel}」${
                value.commentAdded ? '，并附带了处理备注' : ''
              }。`
            }
          ]
        }
      },
      async execute(args) {
        const result = await service.transition(args.key, args.status, args.comment)
        return {
          success: true,
          key: result.item.key,
          title: result.item.title,
          newStatus: result.item.status,
          newStatusLabel: result.item.statusLabel,
          commentAdded: result.commentAdded
        }
      }
    })
  )

  // 4. miniapp_detect_env
  ctx.tools.register(
    defineTool({
      name: 'miniapp_detect_env',
      description:
        'Inspect WeChat MiniProgram project configurations, appid, build scripts in package.json, and WeChat Developer Tools CLI availability.',
      parameters: {
        project_dir: {
          type: 'string',
          description: 'Path to MiniProgram project directory. Defaults to current workspace directory.'
        },
        cli_path: {
          type: 'string',
          description: 'Explicit path to WeChat Developer Tools cli.bat. If omitted, uses config or auto-detects.'
        }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cliPath: { type: 'string' },
            root: { type: 'string', required: true },
            dir: { type: 'string', required: true },
            appid: { type: 'string' },
            projectname: { type: 'string' },
            packageManager: { type: 'string', required: true },
            envs: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  script: { type: 'string', required: true },
                  label: { type: 'string', required: true }
                }
              }
            },
            defaultVersion: { type: 'string', required: true }
          }
        },
        render: (_args, value): ContentBlock[] => {
          const envList =
            value.envs.length > 0 ? value.envs.map((e) => `\`${e.script}\``).join(', ') : '无专用构建脚本（原生项目）'
          const lines = [
            '【微信小程序项目环境】',
            `- 项目名称: ${value.projectname || '未命名'}`,
            `- AppID: ${value.appid || '未配置'}`,
            `- 根目录: ${value.root}`,
            `- 编译产物目录: ${value.dir}`,
            `- 包管理器: ${value.packageManager}`,
            `- 可用发版构建脚本: ${envList}`,
            `- 建议发版版本: ${value.defaultVersion}`,
            `- 微信开发者工具 CLI: ${value.cliPath || '未检测到（需安装或配置）'}`
          ]
          return [{ type: 'text', text: lines.join('\n') }]
        }
      },
      async execute(args) {
        const res = await detectReleaseEnv(args.project_dir, args.cli_path || config.wechatCli)
        return {
          root: res.root,
          dir: res.dir,
          packageManager: res.packageManager,
          envs: res.envs,
          defaultVersion: res.defaultVersion,
          ...(res.cliPath ? { cliPath: res.cliPath } : {}),
          ...(res.appid ? { appid: res.appid } : {}),
          ...(res.projectname ? { projectname: res.projectname } : {})
        }
      }
    })
  )

  // 5. miniapp_preview
  ctx.tools.register(
    defineTool({
      name: 'miniapp_preview',
      description:
        'Compile and generate a WeChat MiniProgram preview QR code. Optionally runs a build script (npm/uni-app/taro) beforehand.',
      parameters: {
        project_dir: {
          type: 'string',
          required: true,
          description: 'Path to MiniProgram project directory.'
        },
        build_script: {
          type: 'string',
          description: 'Build script name from package.json (or "npm" to build npm packages, "skip" to skip build).'
        },
        cli_path: {
          type: 'string',
          description: 'Path to WeChat Developer Tools cli.bat.'
        },
        token: {
          type: 'string',
          description: 'WeChat Developer Tools CLI token for non-interactive / remote environments.'
        }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            appid: { type: 'string' },
            qrDataUrl: { type: 'string', required: true },
            packageSize: { type: 'number' },
            durationMs: { type: 'number', required: true }
          }
        },
        render: (_args, value): ContentBlock[] => {
          const sizeKb = value.packageSize ? `(${(value.packageSize / 1024).toFixed(1)} KB)` : ''
          const text = [
            '【微信小程序预览二维码已生成】',
            `- AppID: ${value.appid || '未知'}`,
            `- 包体大小: ${sizeKb || '未知'}`,
            `- 耗时: ${(value.durationMs / 1000).toFixed(1)}s`,
            `\n请使用微信扫描上方预览二维码体验。Data URL 长度: ${value.qrDataUrl.length} 字符`
          ].join('\n')

          return [
            { type: 'image', source: { type: 'url', url: value.qrDataUrl } } as unknown as ContentBlock,
            { type: 'text', text }
          ]
        }
      },
      async execute(args) {
        const res = await runPreview({
          projectDir: args.project_dir,
          ...(args.build_script ? { buildScript: args.build_script } : {}),
          ...(args.cli_path || config.wechatCli ? { cliPath: args.cli_path || config.wechatCli } : {}),
          ...(args.token ? { token: args.token } : {})
        })
        return {
          qrDataUrl: res.qrDataUrl,
          durationMs: res.durationMs,
          ...(res.appid ? { appid: res.appid } : {}),
          ...(res.packageSize !== undefined ? { packageSize: res.packageSize } : {})
        }
      }
    })
  )

  // 6. miniapp_upload
  ctx.tools.register(
    defineTool({
      name: 'miniapp_upload',
      description:
        'Build and upload a new WeChat MiniProgram version to the WeChat MP admin console with version number and description.',
      parameters: {
        project_dir: {
          type: 'string',
          required: true,
          description: 'Path to MiniProgram project directory.'
        },
        version: {
          type: 'string',
          required: true,
          description: 'Version string in SemVer format (e.g. "1.2.3").'
        },
        desc: {
          type: 'string',
          required: true,
          description: 'Version release notes / changelog (max 200 chars).'
        },
        build_script: {
          type: 'string',
          description: 'Build script name from package.json (or "npm" to build npm packages, "skip" to skip build).'
        },
        cli_path: {
          type: 'string',
          description: 'Path to WeChat Developer Tools cli.bat.'
        },
        token: {
          type: 'string',
          description: 'WeChat Developer Tools CLI token for non-interactive / remote environments.'
        }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            appid: { type: 'string' },
            version: { type: 'string', required: true },
            desc: { type: 'string', required: true },
            packageSize: { type: 'number' },
            durationMs: { type: 'number', required: true }
          }
        },
        render: (_args, value): ContentBlock[] => {
          const sizeKb = value.packageSize ? `(${(value.packageSize / 1024).toFixed(1)} KB)` : ''
          const lines = [
            '🎉【微信小程序代码上传成功】',
            `- AppID: ${value.appid || '未知'}`,
            `- 上传版本: v${value.version}`,
            `- 更新描述: ${value.desc}`,
            `- 包体大小: ${sizeKb || '未知'}`,
            `- 耗时: ${(value.durationMs / 1000).toFixed(1)}s`,
            '\n可前往微信公众平台（mp.weixin.qq.com）将其设置为体验版或提交审核。'
          ]
          return [{ type: 'text', text: lines.join('\n') }]
        }
      },
      async execute(args) {
        const res = await runUpload({
          projectDir: args.project_dir,
          version: args.version,
          desc: args.desc,
          ...(args.build_script ? { buildScript: args.build_script } : {}),
          ...(args.cli_path || config.wechatCli ? { cliPath: args.cli_path || config.wechatCli } : {}),
          ...(args.token ? { token: args.token } : {})
        })
        return {
          version: res.version,
          desc: res.desc,
          durationMs: res.durationMs,
          ...(res.appid ? { appid: res.appid } : {}),
          ...(res.packageSize !== undefined ? { packageSize: res.packageSize } : {})
        }
      }
    })
  )

  // 7. apifox_get_contract
  ctx.tools.register(
    defineTool({
      name: 'apifox_get_contract',
      description:
        'Fetch and parse an Apifox API operation by full documentation URL or project/api IDs, generating full OpenAPI parameter matrix, body schemas, response tables, and TypeScript interface declarations.',
      parameters: {
        url: {
          type: 'string',
          description: 'Apifox API detail URL, e.g. https://app.apifox.com/project/12345/apis/api-67890'
        },
        project_id: {
          type: 'string',
          description: 'Apifox Project ID (required if url is not provided)'
        },
        api_id: {
          type: 'string',
          description: 'Apifox API ID (e.g. "67890" or "api-67890", required if url is not provided)'
        }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            projectId: { type: 'string', required: true },
            apiId: { type: 'string', required: true },
            title: { type: 'string', required: true },
            method: { type: 'string', required: true },
            path: { type: 'string', required: true },
            contractMarkdown: { type: 'string', required: true },
            typeScriptDefinition: { type: 'string', required: true }
          }
        },
        render: (_args, value): ContentBlock[] => {
          return [{ type: 'text', text: value.contractMarkdown }]
        }
      },
      async execute(args) {
        let projectId = args.project_id
        let apiId = args.api_id
        let sourceUrl: string | undefined

        if (args.url && args.url.trim()) {
          const classified = classifyLink(args.url.trim())
          if (classified.kind !== 'apifox') {
            throw new AppError('INVALID_APIFOX_URL', '只支持 Apifox 接口链接，例如: https://app.apifox.com/project/123/apis/api-456')
          }
          projectId = classified.projectId
          apiId = classified.apiId
          sourceUrl = classified.url
        }

        if (!projectId || !apiId) {
          throw new AppError('MISSING_PARAMS', '请提供 Apifox 接口详情页完整链接，或同时提供 project_id 与 api_id')
        }

        const normalizedApiId = apiId.replace(/^api-/, '')
        const { doc, found } = await apifoxClient.operation({
          kind: 'apifox',
          url: sourceUrl || `https://app.apifox.com/project/${projectId}/apis/api-${normalizedApiId}`,
          projectId,
          apiId: normalizedApiId
        })

        const rendered = renderContract(doc, found, {
          projectId,
          apiId: normalizedApiId,
          source: sourceUrl
        })

        return {
          projectId,
          apiId: normalizedApiId,
          title: found.title,
          method: found.method,
          path: found.path,
          contractMarkdown: rendered.markdown,
          typeScriptDefinition: rendered.tsDefinition
        }
      }
    })
  )

  // 8. workbench_get_work_summary
  ctx.tools.register(
    defineTool({
      name: 'workbench_get_work_summary',
      description:
        'Aggregate local Git commits and completed TAPD tasks/bugs across specified repositories and date range into formatted materials for daily, weekly, or sprint reports.',
      parameters: {
        since: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format. Defaults to 7 days ago.'
        },
        until: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to today.'
        },
        repo_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of repository paths to scan Git commits. Defaults to current directory.'
        },
        authors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter Git commits by author name(s). Defaults to current Git user.'
        },
        include_tapd: {
          type: 'boolean',
          description: 'Whether to include TAPD tasks and bugs history. Defaults to true.'
        }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            since: { type: 'string', required: true },
            until: { type: 'string', required: true },
            commitCount: { type: 'integer', required: true },
            tapdCount: { type: 'integer', required: true },
            summaryMarkdown: { type: 'string', required: true }
          }
        },
        render: (_args, value): ContentBlock[] => {
          return [{ type: 'text', text: value.summaryMarkdown }]
        }
      },
      async execute(args) {
        const result = await collectWorkSummary(
          {
            since: args.since,
            until: args.until,
            ...(args.repo_paths ? { repoPaths: args.repo_paths } : {}),
            ...(args.authors ? { authors: args.authors } : {}),
            ...(args.include_tapd !== undefined ? { includeTapd: args.include_tapd } : {})
          },
          service
        )
        return {
          since: result.since,
          until: result.until,
          commitCount: result.gitCommits.length,
          tapdCount: result.tapdItems.length,
          summaryMarkdown: result.summaryMarkdown
        }
      }
    })
  )

  // 9. workbench_list_projects
  ctx.tools.register(
    defineTool({
      name: 'workbench_list_projects',
      description:
        'List all registered workbench projects, repo paths, types (miniapp, admin, h5, pc, cli, etc.), notes, and local git availability from 项目.md.',
      parameters: {
        query: {
          type: 'string',
          description: 'Optional search keyword to filter by project name, repo path, type, or note.'
        },
        type: {
          type: 'string',
          description: 'Optional filter by project type (e.g., "miniapp", "admin", "h5", "pc", "cli", "desktop", "frontend").'
        },
        map_path: {
          type: 'string',
          description: 'Optional explicit path to the "项目.md" repo mapping file.'
        }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            total: { type: 'integer', required: true },
            availableCount: { type: 'integer', required: true },
            mapFilePath: { type: 'string', required: true },
            markdown: { type: 'string', required: true },
            projects: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  name: { type: 'string', required: true },
                  repoPath: { type: 'string', required: true },
                  type: { type: 'string', required: true },
                  typeLabel: { type: 'string', required: true },
                  note: { type: 'string', required: true },
                  available: { type: 'boolean', required: true },
                  unavailableReason: { type: 'string' }
                }
              }
            }
          }
        },
        render: (_args, value): ContentBlock[] => {
          return [{ type: 'text', text: value.markdown }]
        }
      },
      async execute(args) {
        const customPath =
          args.map_path || config.projectMapPath || (config.vaultPath ? `${config.vaultPath}/项目.md` : undefined)
        const res = await listProjects({
          ...(customPath ? { mapPath: customPath } : {}),
          ...(args.query ? { query: args.query } : {}),
          ...(args.type ? { type: args.type } : {})
        })
        return {
          total: res.total,
          availableCount: res.availableCount,
          mapFilePath: res.mapFilePath,
          markdown: res.markdown,
          projects: res.projects.map((p) => ({
            id: p.id,
            name: p.name,
            repoPath: p.repoPath,
            type: p.type,
            typeLabel: p.typeLabel,
            note: p.note,
            available: p.available,
            ...(p.unavailableReason ? { unavailableReason: p.unavailableReason } : {})
          }))
        }
      }
    })
  )
}

