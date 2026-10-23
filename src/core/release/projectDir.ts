import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '../result'

const CONFIG = 'project.config.json'

interface ProjectConfig {
  appid?: string
  miniprogramRoot?: string
}

async function readConfig(dir: string): Promise<ProjectConfig> {
  const raw = await readFile(join(dir, CONFIG), 'utf8')
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, '')) as ProjectConfig
  } catch (e) {
    throw new AppError('PROJECT_CONFIG_INVALID', `${CONFIG} 不是合法的 JSON`, `${join(dir, CONFIG)}\n${String(e)}`)
  }
}

export interface ProjectDir {
  /** 交给开发者工具 CLI 的 --project */
  dir: string
  appid: string | null
}

/**
 * Taro 等框架构建时会在产物目录生成自己的 project.config.json（appid 可能随环境变化），
 * 此时以产物目录为准；否则使用根目录。
 */
export async function resolveProjectDir(root: string): Promise<ProjectDir> {
  if (!existsSync(join(root, CONFIG))) {
    throw new AppError('PROJECT_CONFIG_NOT_FOUND', `找不到 ${CONFIG}`, root)
  }
  const rootConfig = await readConfig(root)
  const sub = rootConfig.miniprogramRoot?.replace(/^\.?[\\/]?$/, '')
  if (sub) {
    const outDir = join(root, sub)
    if (existsSync(join(outDir, CONFIG))) {
      const outConfig = await readConfig(outDir)
      return { dir: outDir.replace(/[\\/]+$/, ''), appid: outConfig.appid || null }
    }
  }
  return { dir: root, appid: rootConfig.appid || null }
}
