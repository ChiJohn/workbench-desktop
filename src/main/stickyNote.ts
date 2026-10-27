import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Services } from './services'

const REL_PATH = '便利贴.md'

export class StickyNoteController {
  constructor(private services: Services) {}

  private fullPath(): string {
    return join(this.services.prefs.get().vaultPath, REL_PATH)
  }

  async read(): Promise<string> {
    const full = this.fullPath()
    if (!existsSync(full)) return ''
    return readFile(full, 'utf8')
  }

  async write(text: string): Promise<null> {
    const full = this.fullPath()
    const tmp = `${full}.tmp`
    await writeFile(tmp, text.replace(/\r\n/g, '\n'), 'utf8')
    await rename(tmp, full)
    return null
  }
}
