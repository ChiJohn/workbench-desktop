import { diffNew, type SeenStore } from '../core/tapd/seenStore'
import type { TapdService } from '../core/tapd/tapdService'
import type { TapdBoard, TapdItem } from '../shared/types'

const INTERVAL_MS = 15 * 60 * 1000
const FIRST_RUN_DELAY_MS = 10_000

export interface TapdPollerDeps {
  service: TapdService
  seen: SeenStore
  hasToken(): boolean
  onBoard(board: TapdBoard): void
  notify(items: TapdItem[]): void
}

/** 定时拉取看板；手动刷新与定时刷新共用同一个进行中的请求 */
export class TapdPoller {
  private timer: NodeJS.Timeout | null = null
  private inflight: Promise<TapdBoard> | null = null

  constructor(private readonly deps: TapdPollerDeps) {}

  start(): void {
    this.stop()
    const tick = () => {
      if (!this.deps.hasToken()) return
      this.refresh({ notify: true })
        .then((board) => this.deps.onBoard(board))
        .catch(() => undefined)
    }
    setTimeout(tick, FIRST_RUN_DELAY_MS).unref?.()
    this.timer = setInterval(tick, INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  refresh({ force = false, notify = false }: { force?: boolean; notify?: boolean } = {}): Promise<TapdBoard> {
    if (this.inflight && !force) return this.inflight
    const run = this.deps.service.board(force).then((board) => {
      const prev = this.deps.seen.load()
      const fresh = diffNew(prev, board.items)
      const keys = board.items.map((i) => i.key)
      // 有项目拉取失败时保留旧记录，避免恢复后把它们的单子当成新单
      this.deps.seen.save(board.errors.length && prev ? new Set([...prev, ...keys]) : keys)
      if (notify && fresh.length) this.deps.notify(fresh)
      return board
    })
    const tracked = run.finally(() => {
      if (this.inflight === tracked) this.inflight = null
    })
    this.inflight = tracked
    return tracked
  }
}
