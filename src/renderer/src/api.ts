import type { Result } from '../../shared/types'

export const api = window.api

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: string
  ) {
    super(message)
  }
}

export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const r = await promise
  if (r.ok) return r.data
  throw new ApiError(r.error.code, r.error.message, r.error.detail)
}
