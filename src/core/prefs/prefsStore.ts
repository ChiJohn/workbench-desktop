import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Prefs, PrefsPatch } from '../../shared/types'

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
    this.prefs = { ...this.prefs, ...patch, repos }
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
