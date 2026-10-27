import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProjectType } from '../../shared/types'

const ADMIN = ['element-plus', 'element-ui', 'antd', 'ant-design-vue']
const H5 = ['vant', 'antd-mobile']

function depsOf(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): string[] {
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
}

function hasAny(deps: string[], names: string[]): boolean {
  return deps.some((d) => names.includes(d) || names.some((n) => n.endsWith('/*') && d.startsWith(n.slice(0, -1))))
}

/** 判断不了时返回 other，目录不存在也返回 other */
export async function detectType(dir: string): Promise<ProjectType> {
  const exists = async (name: string) => {
    try {
      await stat(join(dir, name))
      return true
    } catch {
      return false
    }
  }
  if (await exists('project.config.json')) return 'miniapp'
  if ((await exists('go.mod')) || (await exists('Cargo.toml'))) return 'cli'
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as typeof pkg
  } catch {
    return 'other'
  }
  const deps = depsOf(pkg)
  if (deps.some((d) => d.startsWith('@vben/')) || hasAny(deps, ADMIN)) return 'admin'
  if (deps.some((d) => d.startsWith('@nutui/')) || hasAny(deps, H5)) return 'h5'
  return 'other'
}
