import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Prefs, PrefsPatch, TapdPrefs } from '../../shared/types'

/** 映射按 key 合并，空字符串表示删除该映射 */
function mergeMap(prev: Record<string, string> = {}, patch?: Record<string, string>): Record<string, string> {
  const next = { ...prev, ...patch }
  for (const [k, v] of Object.entries(next)) if (!v) delete next[k]
  return next
}

function mergeTapd(prev: TapdPrefs, patch: TapdPrefs): TapdPrefs {
  return {
    ...prev,
    ...patch,
    iterationRepos: mergeMap(prev.iterationRepos, patch.iterationRepos),
    itemRepos: mergeMap(prev.itemRepos, patch.itemRepos)
  }
}

export class PrefsStore {
  private prefs: Prefs

  constructor(
    private readonly file: string,
    private readonly defaults: Prefs
  ) {
    this.prefs = this.read()
  }

  get(): Prefs {
    return this.prefs
  }

  update(patch: PrefsPatch): Prefs {
    const repos = { ...this.prefs.repos }
    for (const [id, entry] of Object.entries(patch.repos ?? {})) {
      repos[id] = { ...repos[id], ...entry }
    }
    const tapd = patch.tapd ? mergeTapd(this.prefs.tapd ?? {}, patch.tapd) : this.prefs.tapd
    this.prefs = { ...this.prefs, ...patch, repos, ...(tapd && { tapd }) }
    this.write()
    return this.prefs
  }

  private read(): Prefs {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Prefs>
      return { ...this.defaults, ...parsed, repos: { ...parsed.repos } }
    } catch {
      return { ...this.defaults, repos: { ...this.defaults.repos } }
    }
  }

  private write(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.prefs, null, 2))
    renameSync(tmp, this.file)
  }
}
