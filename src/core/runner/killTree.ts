import { execFile } from 'node:child_process'

/** 结束进程及其全部子进程；进程已退出时静默成功 */
export function killTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve())
    })
  }
  try {
    // 非 Windows 下子进程以 detached 启动，负 pid 表示整个进程组
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // 已退出
    }
  }
  return Promise.resolve()
}
