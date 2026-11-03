const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g
const LOCAL_URL_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{2,5})(?:\/[^\s'"<>)\]]*)?/gi

/**
 * 从脚本或终端输出流中提取最新的本地开发服务地址（如 http://localhost:5173/）；
 * 将 0.0.0.0 规范化为 localhost 以便浏览器直接打开。
 */
export function extractLocalUrl(text: string): string | null {
  const clean = text.replace(ANSI_RE, '')
  const matches = [...clean.matchAll(LOCAL_URL_RE)]
  if (matches.length === 0) return null
  const raw = matches[matches.length - 1][0].replace(/[.,;]+$/, '')
  return raw.replace(/\/\/0\.0\.0\.0(?=[:/])/i, '//localhost')
}
