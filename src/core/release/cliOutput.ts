import type { AppErrorInfo } from '../../shared/types'

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g
const CJK = /[\u4e00-\u9fff]/

/**
 * 开发者工具 CLI 出错时退出码仍可能是 0（实测 2.02.x 服务端口关闭时如此），
 * 因此以输出中的 `[error]` 行与 `×` 阶段失败标记判断。
 */
export function detectCliError(output: string): AppErrorInfo | null {
  const lines = output.replace(ANSI, '').split(/\r?\n/)
  const errors = lines.map((l) => /^\s*\[error\]\s*(.*)$/.exec(l)?.[1]?.trim()).filter((l): l is string => Boolean(l))
  const failedStages = lines.map((l) => /^\s*×\s*(.+)$/.exec(l)?.[1]?.trim()).filter((l): l is string => Boolean(l))

  if (errors.some((l) => /service port disabled|服务端口已关闭/i.test(l))) {
    return {
      code: 'WECHAT_CLI_PORT_DISABLED',
      message: '微信开发者工具的服务端口未开启：请打开开发者工具 → 设置 → 安全设置，开启服务端口后重试',
      detail: errors.join('\n')
    }
  }
  if (errors.length) {
    return { code: 'WECHAT_CLI_ERROR', message: errors.find((l) => CJK.test(l)) ?? errors[0], detail: errors.join('\n') }
  }
  if (failedStages.length) {
    return {
      code: 'WECHAT_CLI_ERROR',
      message: `${failedStages[0]} 失败`,
      detail: failedStages.map((s) => `× ${s}`).join('\n')
    }
  }
  return null
}
