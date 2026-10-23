/** 按行数上限保留最近日志；最后一个元素是尚未结束的行 */
export class LineBuffer {
  private lines: string[] = ['']

  constructor(private readonly maxLines: number) {}

  append(chunk: string): void {
    const parts = chunk.split('\n')
    this.lines[this.lines.length - 1] += parts[0]
    for (let i = 1; i < parts.length; i++) this.lines.push(parts[i])
    const overflow = this.lines.length - 1 - this.maxLines
    if (overflow > 0) this.lines.splice(0, overflow)
  }

  clear(): void {
    this.lines = ['']
  }

  toString(): string {
    return this.lines.join('\n')
  }
}
