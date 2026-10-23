import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TapdItem } from '../../shared/types'

/** 首次运行（prev 为 null）只建立基线，不算新单 */
export function diffNew(prev: Set<string> | null, items: TapdItem[]): TapdItem[] {
  if (!prev) return []
  return items.filter((i) => !prev.has(i.key))
}

export class SeenStore {
  constructor(private readonly file: string) {}

  load(): Set<string> | null {
    try {
      const keys = JSON.parse(readFileSync(this.file, 'utf8'))
      return Array.isArray(keys) ? new Set(keys.map(String)) : null
    } catch {
      return null
    }
  }

  save(keys: Iterable<string>): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify([...keys]))
    renameSync(tmp, this.file)
  }
}
