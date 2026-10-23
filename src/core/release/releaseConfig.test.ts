import { describe, expect, it } from 'vitest'
import { bumpPatch, defaultDesc, defaultVersion, detectEnvs, isValidVersion, sanitizeDesc } from './releaseConfig'

describe('detectEnvs', () => {
  const scripts = {
    dev: 'taro build --watch',
    'build:weapp': 'taro build --type weapp',
    'build:h5': 'taro build --type h5',
    'build:weapp:test': 'x',
    'build:weapp-dev': 'y'
  }

  it('keeps build:weapp* scripts in package.json order', () => {
    expect(detectEnvs(scripts).map((e) => e.script)).toEqual(['build:weapp', 'build:weapp:test', 'build:weapp-dev'])
  })

  it('applies labels and hidden flags', () => {
    const envs = detectEnvs(scripts, { 'build:weapp:test': { label: '测试' }, 'build:weapp-dev': { hidden: true } })
    expect(envs).toEqual([
      { script: 'build:weapp', label: 'build:weapp', hidden: false },
      { script: 'build:weapp:test', label: '测试', hidden: false },
      { script: 'build:weapp-dev', label: 'build:weapp-dev', hidden: true }
    ])
  })

  it('ignores a blank label', () => {
    expect(detectEnvs(scripts, { 'build:weapp': { label: '  ' } })[0].label).toBe('build:weapp')
  })
})

describe('versions', () => {
  it('validates x.y.z', () => {
    expect(isValidVersion('1.2.3')).toBe(true)
    expect(isValidVersion('10.0.12')).toBe(true)
    expect(isValidVersion('1.2')).toBe(false)
    expect(isValidVersion('v1.2.3')).toBe(false)
    expect(isValidVersion('1.2.3-beta')).toBe(false)
  })

  it('bumps the patch number', () => {
    expect(bumpPatch('1.2.3')).toBe('1.2.4')
    expect(bumpPatch('1.2.9')).toBe('1.2.10')
    expect(bumpPatch('bad')).toBeNull()
  })

  it('defaults to last upload + 1, then package version, then 1.0.0', () => {
    expect(defaultVersion('2.0.1', '1.0.0')).toBe('2.0.2')
    expect(defaultVersion(undefined, '1.3.0')).toBe('1.3.0')
    expect(defaultVersion(undefined, '1.3.0-beta')).toBe('1.0.0')
    expect(defaultVersion(undefined, undefined)).toBe('1.0.0')
  })
})

describe('descriptions', () => {
  it('replaces characters that break cmd quoting', () => {
    expect(sanitizeDesc('fix "a" 50%\r\nnext')).toBe("fix 'a' 50％ next")
  })

  it('truncates to 200 characters', () => {
    expect(sanitizeDesc('a'.repeat(300))).toHaveLength(200)
  })

  it('builds the default from branch and last commit', () => {
    expect(defaultDesc('release/1.2', { hash: 'abc1234', subject: 'feat: "x"', timestamp: 0 })).toBe(
      "release/1.2 abc1234 feat: 'x'"
    )
    expect(defaultDesc(null, null)).toBe('detached')
  })
})
