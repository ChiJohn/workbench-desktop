import type { AppErrorInfo, Result } from '../shared/types'

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
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

export async function wrap<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn())
  } catch (e) {
    return { ok: false, error: toErrorInfo(e) }
  }
}
