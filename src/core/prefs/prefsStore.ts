import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, normalize } from 'node:path'
import type { AssistantPrefs, MulticaPrefs, Prefs, PrefsPatch, ReportPrefs, TapdPrefs, KnowledgePrefs } from '../../shared/types'

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

function mergeMultica(prev: MulticaPrefs, patch: MulticaPrefs): MulticaPrefs {
  return { ...prev, ...patch, projectMap: mergeMap(prev.projectMap, patch.projectMap) }
}

function mergeKnowledge(prev: KnowledgePrefs, patch: KnowledgePrefs): KnowledgePrefs {
  return { ...prev, ...patch }
}

function mergeAssistant(prev: AssistantPrefs, patch: AssistantPrefs): AssistantPrefs {
  return { ...prev, ...patch }
}

function mergeReport(prev: ReportPrefs, patch: ReportPrefs): ReportPrefs {
  return {
    ...prev,
    ...patch,
    ...((prev.notes || patch.notes) && { notes: mergeMap(prev.notes, patch.notes) }),
    ...((prev.reminders || patch.reminders) && { reminders: { ...prev.reminders, ...patch.reminders } })
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
    const multica = patch.multica ? mergeMultica(this.prefs.multica ?? {}, patch.multica) : this.prefs.multica
    const report = patch.report ? mergeReport(this.prefs.report ?? {}, patch.report) : this.prefs.report
    const knowledge = patch.knowledge ? mergeKnowledge(this.prefs.knowledge ?? {}, patch.knowledge) : this.prefs.knowledge
    const assistant = patch.assistant ? mergeAssistant(this.prefs.assistant ?? {}, patch.assistant) : this.prefs.assistant
    const vaultPath = patch.vaultPath?.trim() ? normalize(patch.vaultPath.trim()) : (patch.vaultPath ?? this.prefs.vaultPath)
    const codeRoot =
      patch.codeRoot !== undefined ? (patch.codeRoot.trim() ? normalize(patch.codeRoot.trim()) : undefined) : this.prefs.codeRoot
    this.prefs = {
      ...this.prefs,
      ...patch,
      vaultPath,
      codeRoot,
      repos,
      ...(tapd && { tapd }),
      ...(multica && { multica }),
      ...(report && { report }),
      ...(knowledge && { knowledge }),
      ...(assistant && { assistant })
    }
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
