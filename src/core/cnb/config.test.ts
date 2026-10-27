import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { apiTriggerEvents, webTriggerButtons } from './config'

const yaml = `
.build: &build
  script: echo hi

main:
  push:
    - stages: []
  api_trigger:
    - stages: []
  web_trigger_prod:
    - stages: []

"feat/*":
  api_trigger_test:
    - name: test

$:
  api_trigger_all:
    - stages: []
`

describe('apiTriggerEvents', () => {
  it('keeps api_trigger events that match the branch and drops web buttons', () => {
    expect(apiTriggerEvents(yaml, 'main')).toEqual(['api_trigger', 'api_trigger_all'])
    expect(apiTriggerEvents(yaml, 'feat/pay')).toEqual(['api_trigger_test', 'api_trigger_all'])
    expect(apiTriggerEvents(yaml, 'develop')).toEqual(['api_trigger_all'])
  })

  it('returns nothing when the file has no trigger the API can start', () => {
    expect(apiTriggerEvents('main:\n  web_trigger_test_build:\n    - docker: {}\n', 'main')).toEqual([])
  })
})

describe('webTriggerButtons', () => {
  const yaml = `
branch:
  - reg: ^dev
    buttons:
      - name: 线上联调环境构建
        event: web_trigger_test_build
  - reg: ^test
    buttons:
      - name: test-k8s构建
        event: web_trigger_test_k8s_build
        inputs:
          NAME_SPACE:
            default: saas-sit
            options:
              - name: test环境
                value: saas-sit
  - reg: ^main
    buttons:
      - name: k8s金碧生产构建
        event: web_trigger_prod_k8s_build
`

  it('lists buttons for the current branch and keeps the others visible but unmatched', () => {
    const dev = webTriggerButtons(yaml, 'dev')
    expect(dev.options.map((item) => [item.name, item.matched])).toEqual([
      ['线上联调环境构建', true],
      ['test-k8s构建', false],
      ['k8s金碧生产构建', false]
    ])
    expect(webTriggerButtons(yaml, 'test-1').options.find((item) => item.matched)).toMatchObject({
      name: 'test-k8s构建',
      env: { NAME_SPACE: 'saas-sit' }
    })
    expect(webTriggerButtons(yaml, 'feat/pay').options.filter((item) => item.matched)).toEqual([])
  })

  it('reads the lvcc button file when it is on this machine', () => {
    const path = 'D:/job/code/lvcc-manage-admin/.cnb/web_trigger.yml'
    if (!existsSync(path)) return
    const text = readFileSync(path, 'utf8')
    const feat = webTriggerButtons(text, 'feat/pay')
    expect(feat.options.map((item) => item.name)).toEqual([
      '线上联调环境构建',
      'test-k8s构建',
      'k8s构建',
      'test-uat-k8s构建',
      'k8s金碧生产构建',
      'k8s租户生产构建'
    ])
    expect(feat.options.filter((item) => item.matched)).toEqual([])
    expect(webTriggerButtons(text, 'test').options.filter((item) => item.matched).map((item) => item.name)).toEqual(['test-k8s构建'])
  })
})
