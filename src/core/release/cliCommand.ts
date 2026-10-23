import { AppError } from '../result'
import { isValidVersion, sanitizeDesc } from './releaseConfig'

export type CliInput =
  | { kind: 'build-npm'; projectDir: string }
  | { kind: 'preview'; projectDir: string; qrOutput: string; infoOutput: string }
  | { kind: 'upload'; projectDir: string; version: string; desc: string; infoOutput: string }

/** cli.bat 只能经 cmd 执行；双引号会提前结束参数，% 会触发变量展开 */
function quotePath(p: string): string {
  if (/["%]/.test(p)) throw new AppError('INVALID_PATH', `路径包含不支持的字符（" 或 %）：${p}`, p)
  return `"${p}"`
}

export function buildCliCommand(cli: string, input: CliInput): string {
  const args = [quotePath(cli), input.kind, '--project', quotePath(input.projectDir)]
  switch (input.kind) {
    case 'build-npm':
      break
    case 'preview':
      args.push('--qr-format', 'base64', '--qr-output', quotePath(input.qrOutput))
      args.push('--info-output', quotePath(input.infoOutput))
      break
    case 'upload': {
      if (!isValidVersion(input.version)) {
        throw new AppError('INVALID_VERSION', `版本号需要是 x.y.z 格式：${input.version}`)
      }
      const desc = sanitizeDesc(input.desc)
      if (!desc) throw new AppError('INVALID_DESC', '请填写上传描述')
      args.push('-v', `"${input.version}"`, '-d', `"${desc}"`, '--info-output', quotePath(input.infoOutput))
      break
    }
  }
  args.push('--lang', 'zh')
  return args.join(' ')
}
