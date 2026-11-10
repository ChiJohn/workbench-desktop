export interface AppErrorInfo {
  code: string
  message: string
  detail?: string | undefined
}

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: string | undefined
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function toErrorInfo(e: unknown): AppErrorInfo {
  if (e instanceof AppError) {
    return { code: e.code, message: e.message, detail: e.detail }
  }
  if (e instanceof Error) {
    return { code: 'UNKNOWN', message: e.message, detail: e.stack }
  }
  return { code: 'UNKNOWN', message: String(e) }
}
