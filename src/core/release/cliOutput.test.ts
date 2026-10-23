import { describe, expect, it } from 'vitest'
import { detectCliError } from './cliOutput'

/** 2.02.2610212 服务端口关闭时的真实输出，退出码为 0 */
const PORT_DISABLED = `- 初始化
(node:37620) [DEP0040] DeprecationWarning: The \`punycode\` module is deprecated. Please use a userland alternative instead.
× 初始化
[error] IDE service port disabled. To use CLI Call, please enter y to confirm enabling CLI capability, or manually open IDE -> Settings -> Security Settings, and set Service Port On.
For more details see: https://developers.weixin.qq.com/miniprogram/en/dev/devtools/cli.html
[error] 工具的服务端口已关闭。要使用命令行调用工具，请手动打开工具 -> 设置 -> 安全设置，将服务端口开启。
详细信息: https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html
[info] Exit
`

describe('detectCliError', () => {
  it('returns null for successful output', () => {
    expect(detectCliError('- 初始化\n✔ 初始化\n- 上传\n✔ 上传\n[info] Exit\n')).toBeNull()
  })

  it('recognizes the disabled service port', () => {
    const e = detectCliError(PORT_DISABLED)
    expect(e?.code).toBe('WECHAT_CLI_PORT_DISABLED')
    expect(e?.message).toContain('安全设置')
  })

  it('prefers the Chinese error line and keeps all error lines as detail', () => {
    const e = detectCliError('\x1b[31m[error]\x1b[39m {"code":10,"message":"need login"}\n[error] 需要重新登录\n')
    expect(e).toEqual({
      code: 'WECHAT_CLI_ERROR',
      message: '需要重新登录',
      detail: '{"code":10,"message":"need login"}\n需要重新登录'
    })
  })

  it('treats a failed stage marker as an error', () => {
    expect(detectCliError('- 上传\n× 上传\n')).toEqual({
      code: 'WECHAT_CLI_ERROR',
      message: '上传 失败',
      detail: '× 上传'
    })
  })
})
