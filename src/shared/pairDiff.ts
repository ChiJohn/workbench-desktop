export type DiffRowKind = 'file' | 'hunk' | 'context' | 'add' | 'del' | 'change'

export interface DiffRow {
  kind: DiffRowKind
  text?: string
  left?: string
  right?: string
  leftNo?: number
  rightNo?: number
}

const MAX_ROWS = 2000

function fileName(line: string): string {
  const at = line.lastIndexOf(' b/')
  return at === -1 ? line.replace(/^diff --git /, '') : line.slice(at + 3)
}

/** 把 unified diff 配成左右两列。连续的删除和新增按行对齐成改动。 */
export function pairDiff(text: string): { rows: DiffRow[]; binary: boolean; truncated: boolean } {
  if (/^Binary files /m.test(text) || text.includes('GIT binary patch')) {
    return { rows: [], binary: true, truncated: false }
  }
  const lines = text.split(/\r?\n/)
  const rows: DiffRow[] = []
  let leftNo = 0
  let rightNo = 0
  let truncated = false
  let stopped = false
  let inHunk = false
  const push = (row: DiffRow) => {
    if (rows.length >= MAX_ROWS) {
      truncated = true
      stopped = true
      return
    }
    rows.push(row)
  }

  let i = 0
  while (i < lines.length && !stopped) {
    const line = lines[i]
    if (line.startsWith('diff --git ')) {
      inHunk = false
      push({ kind: 'file', text: fileName(line) })
      i++
      continue
    }
    if (!inHunk && (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('index '))) {
      i++
      continue
    }
    if (line.startsWith('@@')) {
      inHunk = true
      const mark = /@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line)
      leftNo = mark ? Number(mark[1]) : 0
      rightNo = mark ? Number(mark[2]) : 0
      push({ kind: 'hunk', text: line })
      i++
      continue
    }
    if (line.startsWith('\\') || (!line.startsWith('+') && !line.startsWith('-') && !line.startsWith(' '))) {
      i++
      continue
    }
    if (line.startsWith(' ')) {
      const value = line.slice(1)
      push({ kind: 'context', leftNo, rightNo, left: value, right: value })
      leftNo++
      rightNo++
      i++
      continue
    }
    const dels: string[] = []
    const adds: string[] = []
    while (i < lines.length && lines[i].startsWith('-')) {
      dels.push(lines[i].slice(1))
      i++
    }
    while (i < lines.length && lines[i].startsWith('+')) {
      adds.push(lines[i].slice(1))
      i++
    }
    const count = Math.max(dels.length, adds.length)
    for (let k = 0; k < count && !stopped; k++) {
      const left = dels[k]
      const right = adds[k]
      if (left !== undefined && right !== undefined) {
        push({ kind: 'change', leftNo, rightNo, left, right })
        leftNo++
        rightNo++
      } else if (left !== undefined) {
        push({ kind: 'del', leftNo, left })
        leftNo++
      } else {
        push({ kind: 'add', rightNo, right })
        rightNo++
      }
    }
  }
  return { rows, binary: false, truncated }
}
