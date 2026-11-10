import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as workbench from '../src/index.js'
import { resolveTapdToken } from '../src/tapd/tokenSource.js'
import { isValidVersion, bumpPatch, defaultVersion, sanitizeDesc, detectEnvs } from '../src/release/releaseConfig.js'
import { buildCliCommand } from '../src/release/cliCommand.js'
import { detectCliError } from '../src/release/cliOutput.js'
import { qrToDataUrl } from '../src/release/qrDataUrl.js'
import { classifyLink, findLinks } from '../src/align/links.js'
import { findOperation, renderContract, type OpenApiDoc } from '../src/align/contract.js'
import { parseGitLog } from '../src/report/gitHistory.js'
import { parseProjectMap, listProjects } from '../src/registry/projectRegistry.js'

describe('dsh-workbench plugin', () => {
  describe('TAPD integration', () => {
    it('correctly resolves tapd token from environment or config', () => {
      const token = resolveTapdToken('my-explicit-token')
      expect(token).toBe('my-explicit-token')

      const fallbackToken = resolveTapdToken()
      expect(fallbackToken).toBeDefined()
      expect(typeof fallbackToken).toBe('string')
    })

    it('registers tapd tools on Context', async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(workbench, { token: 'dummy-test-token' })

      const toolNames = ctx.tools.schemas().map((s) => s.name)
      expect(toolNames).toContain('tapd_list_tasks')
      expect(toolNames).toContain('tapd_get_task_detail')
      expect(toolNames).toContain('tapd_update_task_status')
    })

    it('tapd_list_tasks has valid parameter and output schema', async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(workbench, { token: 'dummy-test-token' })

      const listTool = ctx.tools.schemas().find((s) => s.name === 'tapd_list_tasks')
      expect(listTool).toBeDefined()
      expect(listTool?.description).toContain('TAPD')
      const params = listTool?.parameters as { properties?: Record<string, unknown> }
      expect(params.properties?.kind).toBeDefined()
      expect(params.properties?.workspace).toBeDefined()
    })

    it('executes tapd_list_tasks tool and returns formatted text', async () => {
      const mockFetch = vi.fn(async (url: string) => {
        const u = new URL(url)
        let data: unknown = {}
        if (u.pathname === '/users/info') {
          data = { nick: 'test-user' }
        } else if (u.pathname === '/workspaces/user_participant_projects') {
          data = [{ Workspace: { id: '999', name: '测试空间' } }]
        } else if (u.pathname === '/workflows/status_map') {
          data = { open: '新建', done: '完成' }
        } else if (u.pathname === '/workflows/last_steps') {
          data = { done: '完成' }
        } else if (u.pathname === '/stories') {
          data = [
            {
              Story: {
                id: '1001',
                name: '支持工作台插件化',
                workspace_id: '999',
                status: 'open',
                owner: 'test-user',
                priority: 'High',
                modified: '2026-11-09 16:00:00'
              }
            }
          ]
        } else if (u.pathname === '/bugs' || u.pathname === '/tasks' || u.pathname === '/iterations') {
          data = []
        }
        return new Response(JSON.stringify({ status: 1, data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      })

      const originalFetch = globalThis.fetch
      globalThis.fetch = mockFetch as unknown as typeof fetch

      try {
        const ctx = new Context()
        await ctx.plugin(SystemPrompt)
        await ctx.plugin(ToolRuntime)
        await ctx.plugin(workbench, { token: 'mock-token' })

        const result = await ctx.tools.execute({
          callId: ToolCallId('call-1'),
          signal: new AbortController().signal,
          name: 'tapd_list_tasks',
          arguments: { kind: 'story' }
        })

        expect(result.isError).toBe(false)
        const textBlock = result.content.find((b) => b.type === 'text')
        expect(textBlock?.type === 'text' && textBlock.text).toContain('支持工作台插件化')
        expect(textBlock?.type === 'text' && textBlock.text).toContain('test-user')
        expect(textBlock?.type === 'text' && textBlock.text).toContain('story:1001')
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('MiniApp Release tools & utilities', () => {
    it('registers miniapp tools on Context', async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(workbench, {})

      const toolNames = ctx.tools.schemas().map((s) => s.name)
      expect(toolNames).toContain('miniapp_detect_env')
      expect(toolNames).toContain('miniapp_preview')
      expect(toolNames).toContain('miniapp_upload')
    })

    it('releaseConfig validates and bumps semver properly', () => {
      expect(isValidVersion('1.0.0')).toBe(true)
      expect(isValidVersion('1.0.0-beta')).toBe(false)
      expect(bumpPatch('1.0.5')).toBe('1.0.6')
      expect(bumpPatch('invalid')).toBe(null)
      expect(defaultVersion('1.2.3', '1.0.0')).toBe('1.2.4')
      expect(defaultVersion(undefined, '2.1.0')).toBe('2.1.0')
      expect(defaultVersion(undefined, undefined)).toBe('1.0.0')

      expect(sanitizeDesc('feat: "upload" 100% done\r\nnext')).toBe("feat: 'upload' 100％ done next")
      const envs = detectEnvs({ 'build:weapp': 'vue-cli-service build', 'build:h5': '...', dev: '...' })
      expect(envs).toEqual([{ script: 'build:weapp', label: 'build:weapp' }])
    })

    it('buildCliCommand formats CLI commands correctly', () => {
      const cli = 'C:\\Program Files\\Tencent\\cli.bat'
      const previewCmd = buildCliCommand(cli, {
        kind: 'preview',
        projectDir: 'D:\\my-project\\dist',
        qrOutput: 'D:\\tmp\\qr.txt',
        infoOutput: 'D:\\tmp\\info.json'
      })
      expect(previewCmd).toContain('preview')
      expect(previewCmd).toContain('--qr-format base64')
      expect(previewCmd).toContain('--qr-output "D:\\tmp\\qr.txt"')

      const uploadCmd = buildCliCommand(cli, {
        kind: 'upload',
        projectDir: 'D:\\my-project',
        version: '1.2.0',
        desc: '修复登录问题',
        infoOutput: 'D:\\tmp\\info.json'
      })
      expect(uploadCmd).toContain('upload')
      expect(uploadCmd).toContain('-v "1.2.0"')
      expect(uploadCmd).toContain('-d "修复登录问题"')
    })

    it('detectCliError identifies port disabled and errors in output', () => {
      const portDisabledOutput = '[error] Error: service port disabled, please open service port in settings'
      const detected = detectCliError(portDisabledOutput)
      expect(detected?.code).toBe('WECHAT_CLI_PORT_DISABLED')
      expect(detected?.message).toContain('微信开发者工具的服务端口未开启')

      const normalOutput = 'Upload finished successfully'
      expect(detectCliError(normalOutput)).toBe(null)
    })

    it('qrToDataUrl converts raw PNG/JPEG/base64 buffer to data url', () => {
      const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
      const dataUrl = qrToDataUrl(fakePng)
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)

      const textBase64 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
      const textUrl = qrToDataUrl(textBase64)
      expect(textUrl.startsWith('data:image/png;base64,')).toBe(true)
    })
  })

  describe('Apifox alignment tools & utilities', () => {
    it('registers apifox_get_contract tool on Context', async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(workbench, {})

      const toolNames = ctx.tools.schemas().map((s) => s.name)
      expect(toolNames).toContain('apifox_get_contract')
    })

    it('classifyLink and findLinks recognize Apifox and Figma URLs', () => {
      const apifoxUrl = 'https://app.apifox.com/project/4321/apis/api-9876'
      const classifiedApifox = classifyLink(apifoxUrl)
      expect(classifiedApifox.kind).toBe('apifox')
      if (classifiedApifox.kind === 'apifox') {
        expect(classifiedApifox.projectId).toBe('4321')
        expect(classifiedApifox.apiId).toBe('9876')
      }

      const figmaUrl = 'https://www.figma.com/design/abc1234/my-design?node-id=42:108'
      const classifiedFigma = classifyLink(figmaUrl)
      expect(classifiedFigma.kind).toBe('figma')
      if (classifiedFigma.kind === 'figma') {
        expect(classifiedFigma.nodeId).toBe('42:108')
      }

      const mixedText = `
        查看接口: https://app.apifox.com/project/4321/apis/api-9876
        设计稿: https://www.figma.com/design/abc1234/my-design?node-id=42:108
      `
      const links = findLinks(mixedText)
      expect(links.length).toBe(2)
      expect(links[0]!.kind).toBe('apifox')
      expect(links[1]!.kind).toBe('figma')
    })

    it('findOperation parses OpenAPI doc and extracts operation', () => {
      const mockDoc: OpenApiDoc = {
        paths: {
          '/api/v1/users': {
            get: {
              summary: '获取用户列表',
              'x-apifox-id': 9876,
              parameters: [
                {
                  name: 'page',
                  in: 'query',
                  required: true,
                  schema: { type: 'integer' },
                  description: '页码'
                }
              ],
              responses: {
                '200': {
                  description: '成功',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          items: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                name: { type: 'string' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      const found = findOperation(mockDoc, '9876')
      expect(found).not.toBeNull()
      expect(found?.method).toBe('GET')
      expect(found?.path).toBe('/api/v1/users')
      expect(found?.title).toBe('获取用户列表')

      const rendered = renderContract(mockDoc, found!, {
        projectId: '4321',
        apiId: '9876'
      })

      expect(rendered.markdown).toContain('【接口契约】获取用户列表')
      expect(rendered.markdown).toContain('`GET /api/v1/users`')
      expect(rendered.markdown).toContain('page')
      expect(rendered.tsDefinition).toContain('export interface Api9876Response')
      expect(rendered.tsDefinition).toContain('total')
    })
  })

  describe('Work Summary & Git History tools', () => {
    it('registers workbench_get_work_summary tool on Context', async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(workbench, {})

      const toolNames = ctx.tools.schemas().map((s) => s.name)
      expect(toolNames).toContain('workbench_get_work_summary')
    })

    it('parseGitLog parses formatted git log output', () => {
      const sampleOut = '\x1eabc123456789\x1f2026-11-09T12:00:00+08:00\x1ffeat: 支持工作台插件化\n 2 files changed, 25 insertions(+), 3 deletions(-)'
      const records = parseGitLog(sampleOut, 'my-repo')
      expect(records.length).toBe(1)
      expect(records[0]!.hash).toBe('abc123456789')
      expect(records[0]!.subject).toBe('feat: 支持工作台插件化')
      expect(records[0]!.files).toBe(2)
      expect(records[0]!.insertions).toBe(25)
      expect(records[0]!.deletions).toBe(3)
      expect(records[0]!.repoName).toBe('my-repo')
    })
  })

  describe('Project Registry & Repository Mapping', () => {
    const sampleRepoMap = `
# 项目

## 已确认映射

| Obsidian 项目 | 代码仓库 / 入口目录 | 类型 | 说明 |
| --- | --- | --- | --- |
| [[项目/恒优选小程序/主页]] | \`D:\\job\\code\\material-mp\` | 小程序应用 | 恒优选微信小程序。 |
| [[项目/恒优选后台/主页]] | \`D:\\job\\code\\material-platform\` | 后台前端仓库 | 恒优选后台管理端。 |
| [[项目/ai招标/主页]] | \`D:\\job\\code\\investment-ui\` | 前端仓库 | AI 招标项目。 |
| [[项目/测试重复/主页]] | \`D:\\job\\code\\material-mp\` | 小程序应用 | 重复路径 |
`

    it('parseProjectMap parses markdown table and extracts project metadata', () => {
      const { projects, skipped } = parseProjectMap(sampleRepoMap)
      expect(projects.length).toBe(3)
      expect(skipped.length).toBe(1)
      expect(skipped[0]!.reason).toContain('重复')

      const miniapp = projects.find((p) => p.name === '恒优选小程序')
      expect(miniapp).toBeDefined()
      expect(miniapp!.type).toBe('miniapp')
      expect(miniapp!.repoPath).toBe('D:\\job\\code\\material-mp')
      expect(miniapp!.note).toBe('恒优选微信小程序。')
    })

    it('listProjects reads local map and filters by keyword or type', async () => {
      const result = await listProjects({ query: 'workbench' })
      expect(result.total).toBeGreaterThanOrEqual(1)
      expect(result.projects.some((p) => p.name.includes('workbench'))).toBe(true)
      expect(result.markdown).toContain('【项目仓库映射列表】')
    })

    it('registers and executes workbench_list_projects tool', async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(workbench, {})

      const tool = ctx.tools.get('workbench_list_projects')
      expect(tool).toBeDefined()

      const res = await tool!.execute(
        { query: '小程序' },
        { session: 'test-session', callId: 'call-list-proj' as ToolCallId }
      )
      expect(res.total).toBeGreaterThanOrEqual(1)
      expect(res.projects.length).toBe(res.total)
      expect(res.mapFilePath).toBeDefined()
    })
  })
})

