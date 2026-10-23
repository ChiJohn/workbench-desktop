import type { WorkbenchApi } from '../../shared/ipc'

declare global {
  interface Window {
    api: WorkbenchApi
  }
}

export {}
