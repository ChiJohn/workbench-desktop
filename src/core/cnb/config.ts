import type { CnbTriggerOption } from '../../shared/types'

/** 从 .cnb.yml 里取出当前分支能用、且接口允许触发的事件。 */
export function apiTriggerEvents(yaml: string, branch: string): string[] {
  const events = new Set<string>()
  let section: string | null = null
  let eventIndent = -1
  for (const raw of yaml.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue
    const indent = raw.length - raw.trimStart().length
    const key = mappingKey(raw.trim())
    if (indent === 0) {
      section = key
      eventIndent = -1
      continue
    }
    if (!section || section.startsWith('.') || !key) continue
    if (eventIndent < 0) eventIndent = indent
    if (indent !== eventIndent) continue
    if (branchMatches(section, branch) && isApiTrigger(key)) events.add(key)
  }
  return [...events]
}

/** 读取 .cnb/web_trigger.yml 里的按钮。不匹配当前分支的也返回，matched 为 false。 */
export function webTriggerButtons(yaml: string, branch: string): { options: CnbTriggerOption[]; patterns: string[] } {
  const patterns: string[] = []
  const options: CnbTriggerOption[] = []
  let reg = ''
  let inButtons = false
  let inChoices = false
  let current: CnbTriggerOption | null = null
  let inputKey = ''

  const push = () => {
    if (!current?.name || !current.event) return
    current.matched = regMatches(reg, branch)
    options.push(current)
  }

  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const indent = raw.length - raw.trimStart().length
    const regLine = /^-?\s*reg:\s*(.+)$/.exec(line)
    if (regLine && indent <= 4) {
      push()
      current = null
      inButtons = false
      inChoices = false
      reg = clean(regLine[1])
      patterns.push(reg)
      continue
    }
    if (line === 'buttons:') {
      inButtons = true
      continue
    }
    if (!inButtons) continue
    const nameLine = /^-\s+name:\s*(.+)$/.exec(line)
    if (nameLine && !inChoices) {
      push()
      current = { name: clean(nameLine[1]), event: '', description: '', env: {}, matched: false }
      inputKey = ''
      continue
    }
    if (!current) continue
    if (line === 'options:') {
      inChoices = true
      continue
    }
    if (inChoices && indent <= 10) inChoices = false
    const eventLine = /^event:\s*(\S+)/.exec(line)
    if (eventLine) {
      current.event = eventLine[1]
      continue
    }
    const descriptionLine = /^description:\s*(.+)$/.exec(line)
    if (descriptionLine && !current.description) {
      current.description = clean(descriptionLine[1])
      continue
    }
    const inputLine = /^([A-Z][A-Z0-9_]*):\s*$/.exec(line)
    if (inputLine) {
      inputKey = inputLine[1]
      inChoices = false
      continue
    }
    const defaultLine = /^default:\s*(.+)$/.exec(line)
    if (defaultLine && inputKey && !inChoices) current.env[inputKey] = clean(defaultLine[1])
  }
  push()
  return { options, patterns }
}

function clean(value: string): string {
  const text = value.replace(/\s+#.*$/, '').trim()
  const quoted = /^["']([\s\S]*)["']$/.exec(text)
  return quoted ? quoted[1] : text
}

function regMatches(reg: string, branch: string): boolean {
  try {
    return new RegExp(reg).test(branch)
  } catch {
    return false
  }
}

function mappingKey(line: string): string | null {
  const quoted = /^(?:"([^"]+)"|'([^']+)')\s*:\s*(?:#.*)?$/.exec(line)
  if (quoted) return quoted[1] ?? quoted[2] ?? null
  const plain = /^([^:#\s][^:]*?)\s*:\s*(?:#.*)?$/.exec(line)
  return plain ? plain[1] : null
}

function isApiTrigger(event: string): boolean {
  return event === 'api_trigger' || event.startsWith('api_trigger_')
}

function branchMatches(pattern: string, branch: string): boolean {
  if (pattern === '$') return true
  if (!pattern.includes('*') && !pattern.includes('?')) return pattern === branch
  let body = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*' && pattern[i + 1] === '*') {
      body += '.*'
      i++
    } else if (char === '*') body += '[^/]*'
    else if (char === '?') body += '[^/]'
    else body += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char
  }
  return new RegExp(`^${body}$`).test(branch)
}
