import { describe, expect, it } from 'vitest'
import { renderDomainInteractionDoc, renderDomainInteractionHtml } from './domainDoc'

describe('renderDomainInteractionDoc', () => {
  it('renders Mermaid overview, domain business rules, and ordered step flows', () => {
    const sample = {
      version: '1.0.0',
      project: {
        name: 'lv-charge',
        description: '新能源充电桩扫码充电与订单结算小程序'
      },
      nodes: [
        {
          id: 'domain:order',
          type: 'domain',
          name: '充电订单管理',
          summary: '处理用户扫码启动充电、计费与结束结算',
          domainMeta: {
            entities: ['充电订单', '计费策略'],
            businessRules: ['余额低于起充金额时禁止启动充电', '存在进行中订单时提示先结束当前订单'],
            crossDomainInteractions: ['结算时调用钱包模块扣款']
          }
        },
        {
          id: 'flow:start-charge',
          type: 'flow',
          name: '扫码启动充电流程',
          summary: '用户扫描桩端二维码到桩启动输出功率的完整流程',
          domainMeta: {
            entryPoint: 'pages/scan/index',
            entryType: 'manual'
          }
        },
        {
          id: 'step:start-charge:check',
          type: 'step',
          name: '校验桩状态与用户余额',
          summary: '检查充电枪是否插好且账户余额充足',
          filePath: 'src/pages/scan/index.tsx'
        },
        {
          id: 'step:start-charge:create',
          type: 'step',
          name: '创建预充电单并下发指令',
          summary: '调用下单接口并轮询桩端启动结果',
          filePath: 'src/services/order.ts'
        }
      ],
      edges: [
        { source: 'domain:order', target: 'flow:start-charge', type: 'contains_flow', direction: 'forward', weight: 1 },
        { source: 'flow:start-charge', target: 'step:start-charge:create', type: 'flow_step', direction: 'forward', weight: 0.2 },
        { source: 'flow:start-charge', target: 'step:start-charge:check', type: 'flow_step', direction: 'forward', weight: 0.1 }
      ]
    }

    const md = renderDomainInteractionDoc('驴充充小程序', sample, '2026-11-03')
    expect(md).toContain('# 驴充充小程序 — 业务功能与运营操作交互指南')
    expect(md).toContain('余额低于起充金额时禁止启动充电')
    expect(md).toContain('flowchart LR')
    // 验证按 weight 排序：check (0.1) 在 create (0.2) 之前
    const idxCheck = md.indexOf('1. 校验桩状态与用户余额')
    const idxCreate = md.indexOf('2. 创建预充电单并下发指令')
    expect(idxCheck).toBeGreaterThan(0)
    expect(idxCreate).toBeGreaterThan(idxCheck)

    const html = renderDomainInteractionHtml('驴充充小程序', sample, '2026-11-03')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('充电订单管理')
    expect(html).toContain('打印 / 另存为 PDF')
  })
})
