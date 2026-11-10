import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '../util/result.js'

const CONFIG = 'project.config.json'

export interface ProjectConfig {
  appid?: string
  miniprogramRoot?: string
  projectname?: string
}

async function readConfig(dir: string): Promise<ProjectConfig> {
  const raw = await readFile(join(dir, CONFIG), 'utf8')
  try {
    return JSON.parse(raw.replace(/^﻿/, '')) as ProjectConfig
  } catch (e) {
    throw new AppError('PROJECT_CONFIG_INVALID', `${CONFIG} 不是合法的 JSON`, `${join(dir, CONFIG)}\n${String(e)}`)
  }
}

export interface ProjectDir {
  /** 根目录 */
  root: string
  /** 交给开发者工具 CLI 的 --project (有构建输出产物时为产物目录，否则为根目录) */
  dir: string
  appid: string | null
  projectname: string | null
}

export async function resolveProjectDir(root: string): Promise<ProjectDir> {
  if (!existsSync(join(root, CONFIG))) {
    throw new AppError('PROJECT_CONFIG_NOT_FOUND', `在 ${root} 下未找到 ${CONFIG}，请确认是否为小程序项目目录`)
  }
  const rootConfig = await readConfig(root)
  const sub = rootConfig.miniprogramRoot?.replace(/^\.?[\\/]?$/, '')
  if (sub) {
    const outDir = join(root, sub)
    if (existsSync(join(outDir, CONFIG))) {
      const outConfig = await readConfig(outDir)
      return {
        root,
        dir: outDir.replace(/[\\/]+$/, ''),
        appid: outConfig.appid || rootConfig.appid || null,
        projectname: outConfig.projectname || rootConfig.projectname || null
      }
    }
  }
  return {
    root,
    dir: root,
    appid: rootConfig.appid || null,
    projectname: rootConfig.projectname || null
  }
}
