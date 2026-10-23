import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GitService } from '../core/git/gitService'
import { LauncherService } from '../core/launcher/launcherService'
import { PrefsStore } from '../core/prefs/prefsStore'
import { RegistryService } from '../core/registry/registryService'
import { RunnerService } from '../core/runner/runnerService'
import type { Prefs } from '../shared/types'

export interface Services {
  prefs: PrefsStore
  registry: RegistryService
  git: GitService
  runner: RunnerService
  launcher: LauncherService
}

const WECHAT_CLI_CANDIDATES = ['C:', 'D:'].flatMap((drive) =>
  ['Program Files (x86)', 'Program Files'].map((dir) => `${drive}\\${dir}\\Tencent\\微信web开发者工具\\cli.bat`)
)

function defaultPrefs(): Prefs {
  return {
    vaultPath: 'D:\\job\\code\\notes\\AI-Workbench',
    hotkey: 'CommandOrControl+Alt+W',
    terminal: 'wt',
    wechatDevtoolsCli: WECHAT_CLI_CANDIDATES.find((p) => existsSync(p)),
    repos: {}
  }
}

export function createServices(): Services {
  const prefs = new PrefsStore(join(app.getPath('userData'), 'prefs.json'), defaultPrefs())
  return {
    prefs,
    registry: new RegistryService(() => prefs.get().vaultPath),
    git: new GitService(),
    runner: new RunnerService(),
    launcher: new LauncherService()
  }
}
