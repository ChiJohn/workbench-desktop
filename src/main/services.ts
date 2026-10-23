import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GitService } from '../core/git/gitService'
import { LauncherService } from '../core/launcher/launcherService'
import { PrefsStore } from '../core/prefs/prefsStore'
import { RegistryService } from '../core/registry/registryService'
import { detectWechatCli, WECHAT_CLI_CANDIDATES } from '../core/release/devtoolsPath'
import { ReleaseService } from '../core/release/releaseService'
import { RunnerService } from '../core/runner/runnerService'
import { SeenStore } from '../core/tapd/seenStore'
import { TapdClient } from '../core/tapd/tapdClient'
import { TapdService } from '../core/tapd/tapdService'
import { TapdTokenStore } from './tapdToken'
import type { Prefs } from '../shared/types'

export interface Services {
  prefs: PrefsStore
  registry: RegistryService
  git: GitService
  runner: RunnerService
  launcher: LauncherService
  release: ReleaseService
  tapdToken: TapdTokenStore
  tapd: TapdService
  tapdSeen: SeenStore
}

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
  const runner = new RunnerService()
  const tapdToken = new TapdTokenStore(prefs)
  const tapd = new TapdService(new TapdClient({ token: () => tapdToken.get() }), {
    disabledWorkspaces: () => prefs.get().tapd?.disabledWorkspaces ?? []
  })
  return {
    prefs,
    registry: new RegistryService(() => prefs.get().vaultPath),
    git: new GitService(),
    runner,
    launcher: new LauncherService(),
    release: new ReleaseService(runner),
    tapdToken,
    tapd,
    tapdSeen: new SeenStore(join(app.getPath('userData'), 'tapd-seen.json'))
  }
}

/** 候选路径都不存在时再查注册表（安装目录可自定义） */
export async function ensureWechatCli({ prefs }: Services): Promise<void> {
  if (prefs.get().wechatDevtoolsCli) return
  const found = await detectWechatCli()
  if (found && !prefs.get().wechatDevtoolsCli) prefs.update({ wechatDevtoolsCli: found })
}
