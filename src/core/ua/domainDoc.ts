import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { Project } from '../../shared/types'
import { AppError } from '../result'
import { projectFolder } from '../tasks/taskCard'

interface DomainMeta {
  entities?: string[]
  businessRules?: string[]
  crossDomainInteractions?: string[]
  entryPoint?: string
  entryType?: string
}

interface RawNode {
  id: string
  type: string
  name: string
  summary?: string
  filePath?: string
  domainMeta?: DomainMeta
}

interface RawEdge {
  source: string
  target: string
  type: string
  description?: string
  weight?: number
}

interface RawGraph {
  project?: {
    name?: string
    description?: string
    analyzedAt?: string
  }
  nodes?: RawNode[]
  edges?: RawEdge[]
}

function escapeMermaidLabel(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/[\r\n]+/g, ' ')
    .replace(/[[\]{}()<>]/g, ' ')
    .trim()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function mermaidId(prefix: string, index: number): string {
  return `${prefix}_${index}`
}

/** 将 `Device (设备/桩体)` 清洗为面向运营的纯中文名称 `设备/桩体` */
export function humanizeEntityName(raw: string): string {
  const m = /^[A-Za-z0-9_.\s-]+\(([^)]+)\)$/.exec(raw.trim())
  if (m) return m[1].trim()
  const mCn = /^[A-Za-z0-9_.\s-]+（([^）]+)）$/.exec(raw.trim())
  if (mCn) return mCn[1].trim()
  return raw.trim()
}

/** 过滤掉纯技术接口路径（如 `POST /api/...`），转为面向运营的菜单/页面入口说明 */
export function humanizeEntryPoint(entryPoint?: string, domainName?: string, flowName?: string): string | null {
  const raw = entryPoint?.trim()
  if (raw && !/^(?:GET|POST|PUT|DELETE|PATCH)\s+\//i.test(raw) && !/^\/[a-z0-9_/-]+$/i.test(raw)) {
    return raw
  }
  if (domainName && flowName) {
    return `${domainName} → ${flowName}`
  }
  return null
}

/** 将代码/研发术语自动润色为面向用户与运营人员的交互表述 */
export function humanizeOpsText(raw: string): string {
  return raw
    .replace(/调用[^，。；]*接口保存/g, '点击确认保存')
    .replace(/将[^，。；]*封装为表单数据提交后端，?/g, '提交表单后系统自动')
    .replace(/通过异步任务\s*resultKey\s*轮询设备设置执行结果/gi, '系统自动向设备下发配置并实时反馈同步状态')
    .replace(/通过异步任务机制与轮询机制确认硬件指令执行结果/g, '下发硬件参数后系统自动同步并反馈设备生效结果')
    .replace(/大额游标检索/g, '按条件筛选查询')
    .replace(/通过深链游标分页拉取/g, '按筛选条件快速查询并展示')
    .replace(/提供大额订单与深度游标分页查询以保障高并发下数百万级订单的稳定检索。?/g, '支持按小区、设备号、订单状态与时间范围快速检索历史订单。')
    .replace(/调用后台接口获取设备上报的时序采样点，渲染/g, '在订单详情中展示')
    .replace(/同时调用用户信息接口获取/g, '一键查询并展示')
    .replace(/并行请求历史充电订单及充值明细/g, '同屏联动展示历史充电订单与充值记录')
    .replace(/调用小区维保名单接口获取/g, '自动匹配该小区关联的')
    .replace(/通过\s*API\s*保存[^，。；]*，/gi, '点击保存后立即生效，并')
    .replace(/持久化小区档案并刷新组织树/g, '保存小区档案并同步更新区域列表')
    .replace(/保存返赠配置至数据库，/g, '保存充值返赠规则后，')
    .replace(/将小区下多场景规则组合提交至后端，/g, '确认保存该小区的分账规则后，')
    .replace(/基于\s*Shiro\s*(?:框架|权限体系)/gi, '通过角色权限体系')
    .replace(/RBAC\s*权限角色/gi, '岗位角色权限')
    .trim()
}

/**
 * 生成面向用户与运营同学的单文件交互式 HTML（零代码术语、零外部依赖，双击即可在浏览器查看页面交互流与运营规则，支持一键打印/另存为 PDF）
 */
export function renderDomainInteractionHtml(
  projectName: string,
  rawGraph: unknown,
  today: string
): string {
  if (!rawGraph || typeof rawGraph !== 'object' || Array.isArray(rawGraph)) {
    throw new AppError('UA_DOMAIN_INVALID', '业务域图谱数据格式无效')
  }
  const graph = rawGraph as RawGraph
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []

  const domains = nodes.filter((n) => n.type === 'domain')
  const flows = nodes.filter((n) => n.type === 'flow')
  const steps = nodes.filter((n) => n.type === 'step')

  if (domains.length === 0 && flows.length === 0) {
    throw new AppError(
      'UA_DOMAIN_EMPTY',
      '图谱中还没有业务域（domain/flow）节点，请先点「生成业务流程图」运行 /understand-domain'
    )
  }

  const flowById = new Map(flows.map((f) => [f.id, f]))
  const stepById = new Map(steps.map((s) => [s.id, s]))

  const flowsOfDomain = new Map<string, RawNode[]>()
  const assignedFlows = new Set<string>()
  for (const e of edges) {
    if (e.type !== 'contains_flow') continue
    const flow = flowById.get(e.target)
    if (!flow) continue
    let list = flowsOfDomain.get(e.source)
    if (!list) {
      list = []
      flowsOfDomain.set(e.source, list)
    }
    if (!list.includes(flow)) {
      list.push(flow)
      assignedFlows.add(flow.id)
    }
  }

  const stepsOfFlow = new Map<string, { step: RawNode; weight: number; order: number }[]>()
  edges.forEach((e, idx) => {
    if (e.type !== 'flow_step') return
    const step = stepById.get(e.target)
    if (!step) return
    let list = stepsOfFlow.get(e.source)
    if (!list) {
      list = []
      stepsOfFlow.set(e.source, list)
    }
    list.push({ step, weight: typeof e.weight === 'number' ? e.weight : 1, order: idx })
  })
  for (const list of stepsOfFlow.values()) {
    list.sort((a, b) => a.weight - b.weight || a.order - b.order)
  }

  const renderFlowHtml = (flow: RawNode, code: string, domainName?: string) => {
    const orderedSteps = (stepsOfFlow.get(flow.id) ?? []).map((x) => x.step)
    const cleanEntry = humanizeEntryPoint(flow.domainMeta?.entryPoint, domainName, humanizeOpsText(flow.name))
    const entry = cleanEntry ? `<span class="entry-badge">操作入口：${escapeHtml(cleanEntry)}</span>` : ''
    const flowTitle = humanizeOpsText(flow.name)
    const flowDesc = flow.summary ? humanizeOpsText(flow.summary) : ''
    const stepCards = orderedSteps
      .map(
        (st, idx) => `
        <div class="step-card">
          <div class="step-head">
            <span class="step-num">${idx + 1}</span>
            <strong class="step-title">${escapeHtml(humanizeOpsText(st.name))}</strong>
          </div>
          ${st.summary ? `<div class="step-desc">${escapeHtml(humanizeOpsText(st.summary))}</div>` : ''}
        </div>
        ${idx < orderedSteps.length - 1 ? '<div class="step-arrow">→</div>' : ''}`
      )
      .join('')

    return `
      <div class="flow-block" id="flow-${escapeHtml(flow.id)}">
        <div class="flow-header">
          <h4>${escapeHtml(code)} ${escapeHtml(flowTitle)}</h4>
          ${entry}
        </div>
        ${flowDesc ? `<p class="flow-summary">${escapeHtml(flowDesc)}</p>` : ''}
        ${orderedSteps.length > 0 ? `<div class="step-pipeline">${stepCards}</div>` : ''}
      </div>`
  }

  const navItems: string[] = []
  const domainSections: string[] = []

  domains.forEach((d, dIdx) => {
    const dCode = `${dIdx + 1}`
    const dName = humanizeOpsText(d.name)
    const dFlows = flowsOfDomain.get(d.id) ?? []
    navItems.push(
      `<a class="nav-domain" href="#domain-${dIdx + 1}">${dCode}. ${escapeHtml(dName)} <span class="nav-count">${dFlows.length}</span></a>`
    )
    const entities = (d.domainMeta?.entities?.filter(Boolean) ?? []).map(humanizeEntityName)
    const rules = (d.domainMeta?.businessRules?.filter(Boolean) ?? []).map(humanizeOpsText)
    const cross = (d.domainMeta?.crossDomainInteractions?.filter(Boolean) ?? []).map(humanizeOpsText)

    domainSections.push(`
      <section class="domain-card" id="domain-${dIdx + 1}">
        <div class="domain-head">
          <h2>${dCode}. ${escapeHtml(dName)}</h2>
          <div class="entity-list">
            ${entities.map((e) => `<span class="entity-tag">${escapeHtml(e)}</span>`).join('')}
          </div>
        </div>
        ${d.summary ? `<p class="domain-summary">${escapeHtml(humanizeOpsText(d.summary))}</p>` : ''}
        ${
          rules.length > 0
            ? `<div class="rules-box">
                <div class="rules-title">运营规则与操作注意事项</div>
                <ul>${rules.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
              </div>`
            : ''
        }
        ${
          cross.length > 0
            ? `<div class="cross-box">
                <div class="rules-title">跨板块业务影响</div>
                <ul>${cross.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
              </div>`
            : ''
        }
        <div class="flows-wrap">
          ${dFlows.map((f, fIdx) => renderFlowHtml(f, `${dCode}.${fIdx + 1}`, dName)).join('')}
        </div>
      </section>`)
  })

  const orphanFlows = flows.filter((f) => !assignedFlows.has(f.id))
  if (orphanFlows.length > 0) {
    navItems.push(
      `<a class="nav-domain" href="#domain-other">其他业务流程 <span class="nav-count">${orphanFlows.length}</span></a>`
    )
    domainSections.push(`
      <section class="domain-card" id="domain-other">
        <div class="domain-head"><h2>其他业务流程</h2></div>
        <div class="flows-wrap">
          ${orphanFlows.map((f, idx) => renderFlowHtml(f, `F${idx + 1}`)).join('')}
        </div>
      </section>`)
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(projectName)} — 业务功能与运营操作交互指南</title>
<style>
  :root {
    --bg: #f6f8fb;
    --card: #ffffff;
    --border: #e2e8f0;
    --text: #1e293b;
    --muted: #64748b;
    --accent: #2563eb;
    --accent-soft: #eff6ff;
    --rule-bg: #fffbeb;
    --rule-border: #fde68a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: 100vh;
  }
  .sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    padding: 20px 14px;
    background: var(--card);
    border-right: 1px solid var(--border);
  }
  .sidebar h3 {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--muted);
    letter-spacing: 0.05em;
  }
  .nav-domain {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 7px 10px;
    margin-bottom: 4px;
    border-radius: 6px;
    color: var(--text);
    text-decoration: none;
    font-size: 13px;
  }
  .nav-domain:hover { background: var(--accent-soft); color: var(--accent); }
  .nav-count {
    padding: 1px 6px;
    border-radius: 10px;
    background: #f1f5f9;
    color: var(--muted);
    font-size: 11px;
  }
  .content {
    padding: 28px 36px 60px;
    max-width: 1180px;
  }
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  .top-bar h1 { margin: 0; font-size: 22px; }
  .top-meta { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .top-actions { display: flex; gap: 10px; align-items: center; }
  .search-input {
    padding: 7px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    width: 240px;
    font: inherit;
  }
  .print-btn {
    padding: 7px 14px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    font: inherit;
  }
  .domain-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 22px 24px;
    margin-bottom: 22px;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  }
  .domain-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 10px;
  }
  .domain-head h2 { margin: 0; font-size: 18px; color: #0f172a; }
  .entity-list { display: flex; gap: 6px; flex-wrap: wrap; }
  .entity-tag {
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12px;
    font-weight: 500;
  }
  .domain-summary { margin: 0 0 14px; color: #334155; }
  .rules-box, .cross-box {
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 14px;
  }
  .rules-box { background: var(--rule-bg); border: 1px solid var(--rule-border); }
  .cross-box { background: #f8fafc; border: 1px solid var(--border); }
  .rules-title { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
  .rules-box ul, .cross-box ul { margin: 0; padding-left: 18px; }
  .flow-block {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px dashed var(--border);
  }
  .flow-header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .flow-header h4 { margin: 0; font-size: 15px; }
  .entry-badge {
    padding: 2px 9px;
    border-radius: 4px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 12px;
  }
  .flow-summary { margin: 6px 0 12px; color: var(--muted); font-size: 13px; }
  .step-pipeline {
    display: flex;
    align-items: stretch;
    gap: 8px;
    overflow-x: auto;
    padding: 6px 2px 10px;
  }
  .step-card {
    flex: 0 0 245px;
    background: #f8fafc;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .step-head { display: flex; align-items: center; gap: 8px; }
  .step-num {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .step-title { font-size: 13.5px; color: #0f172a; }
  .step-desc { font-size: 12.5px; color: #475569; flex: 1; }
  .step-arrow {
    display: flex;
    align-items: center;
    color: #94a3b8;
    font-size: 18px;
    font-weight: bold;
    flex: none;
  }
  @media print {
    .sidebar, .top-actions { display: none !important; }
    .layout { display: block; }
    .content { padding: 0; max-width: none; }
    .step-pipeline { flex-wrap: wrap; overflow: visible; }
    .domain-card { break-inside: avoid; box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <h3>功能板块导航 (${domains.length})</h3>
      ${navItems.join('\n')}
    </aside>
    <main class="content">
      <div class="top-bar">
        <div>
          <h1>${escapeHtml(projectName)} — 业务功能与运营操作交互指南</h1>
          <div class="top-meta">更新日期：${escapeHtml(today)} · 涵盖 ${domains.length} 大功能板块、${flows.length} 项核心业务操作流、${steps.length} 个操作与交互环节</div>
          ${graph.project?.description ? `<div class="top-meta">${escapeHtml(graph.project.description)}</div>` : ''}
        </div>
        <div class="top-actions">
          <input class="search-input" type="search" placeholder="搜索功能、操作或运营规则…" oninput="filterCards(this.value)" />
          <button class="print-btn" onclick="window.print()">打印 / 另存为 PDF</button>
        </div>
      </div>
      <div id="domains-container">
        ${domainSections.join('\n')}
      </div>
    </main>
  </div>
  <script>
    function filterCards(q) {
      const kw = (q || '').trim().toLowerCase();
      document.querySelectorAll('.domain-card').forEach((card) => {
        const match = !kw || card.innerText.toLowerCase().includes(kw);
        card.style.display = match ? '' : 'none';
      });
    }
  </script>
</body>
</html>`
}

/**
 * 将 domain-graph.json 转换为面向用户、运营与产品的 Markdown + Mermaid 功能交互指南
 */
export function renderDomainInteractionDoc(
  projectName: string,
  rawGraph: unknown,
  today: string
): string {
  if (!rawGraph || typeof rawGraph !== 'object' || Array.isArray(rawGraph)) {
    throw new AppError('UA_DOMAIN_INVALID', '业务域图谱数据格式无效')
  }
  const graph = rawGraph as RawGraph
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []

  const domains = nodes.filter((n) => n.type === 'domain')
  const flows = nodes.filter((n) => n.type === 'flow')
  const steps = nodes.filter((n) => n.type === 'step')

  if (domains.length === 0 && flows.length === 0) {
    throw new AppError(
      'UA_DOMAIN_EMPTY',
      '图谱中还没有业务域（domain/flow）节点，请先点「生成业务流程图」运行 /understand-domain'
    )
  }

  const flowById = new Map(flows.map((f) => [f.id, f]))
  const stepById = new Map(steps.map((s) => [s.id, s]))
  const domainMermaidId = new Map(domains.map((d, i) => [d.id, mermaidId('D', i + 1)]))

  const flowsOfDomain = new Map<string, RawNode[]>()
  const assignedFlows = new Set<string>()
  for (const e of edges) {
    if (e.type !== 'contains_flow') continue
    const flow = flowById.get(e.target)
    if (!flow) continue
    let list = flowsOfDomain.get(e.source)
    if (!list) {
      list = []
      flowsOfDomain.set(e.source, list)
    }
    if (!list.includes(flow)) {
      list.push(flow)
      assignedFlows.add(flow.id)
    }
  }

  const stepsOfFlow = new Map<string, { step: RawNode; weight: number; order: number }[]>()
  edges.forEach((e, idx) => {
    if (e.type !== 'flow_step') return
    const step = stepById.get(e.target)
    if (!step) return
    let list = stepsOfFlow.get(e.source)
    if (!list) {
      list = []
      stepsOfFlow.set(e.source, list)
    }
    list.push({ step, weight: typeof e.weight === 'number' ? e.weight : 1, order: idx })
  })
  for (const list of stepsOfFlow.values()) {
    list.sort((a, b) => a.weight - b.weight || a.order - b.order)
  }

  const lines: string[] = [
    '---',
    'type: product-interaction-doc',
    `project: '${projectName.replace(/'/g, "''")}'`,
    `updated: ${today}`,
    '---',
    '',
    `# ${projectName} — 业务功能与运营操作交互指南`,
    ''
  ]

  if (graph.project?.description?.trim()) {
    lines.push(`> ${graph.project.description.trim()}`, '')
  }

  // 1. 模块总览图
  lines.push('## 一、功能板块与业务协同总览', '')
  if (domains.length > 0) {
    lines.push('```mermaid', 'flowchart LR')
    for (const d of domains) {
      const dId = domainMermaidId.get(d.id)!
      lines.push(`  ${dId}["${escapeMermaidLabel(d.name)}"]`)
      const dFlows = flowsOfDomain.get(d.id) ?? []
      dFlows.forEach((f, fIdx) => {
        const fId = `${dId}_F${fIdx + 1}`
        lines.push(`  ${fId}("${escapeMermaidLabel(f.name)}")`)
        lines.push(`  ${dId} --> ${fId}`)
      })
    }
    for (const e of edges) {
      if (e.type !== 'cross_domain') continue
      const src = domainMermaidId.get(e.source)
      const tgt = domainMermaidId.get(e.target)
      if (!src || !tgt) continue
      const label = e.description ? `|"${escapeMermaidLabel(e.description).slice(0, 28)}"|` : ''
      lines.push(`  ${src} -.->${label} ${tgt}`)
    }
    lines.push('```', '')
  }

  // 2. 各业务板块详情
  lines.push('## 二、各板块运营操作流程与规则说明', '')

  const renderFlowBlock = (flow: RawNode, prefixIndex: string, domainName?: string) => {
    const flowTitle = humanizeOpsText(flow.name)
    lines.push(`### ${prefixIndex} ${flowTitle}`, '')
    if (flow.summary?.trim()) {
      lines.push(`${humanizeOpsText(flow.summary.trim())}`, '')
    }
    const cleanEntry = humanizeEntryPoint(flow.domainMeta?.entryPoint, domainName, flowTitle)
    if (cleanEntry) {
      lines.push(`- **操作入口**：${cleanEntry}`, '')
    }

    const orderedSteps = (stepsOfFlow.get(flow.id) ?? []).map((x) => x.step)
    if (orderedSteps.length > 0) {
      lines.push('```mermaid', 'flowchart LR')
      orderedSteps.forEach((st, idx) => {
        const sId = `S${idx + 1}`
        lines.push(`  ${sId}["${idx + 1}. ${escapeMermaidLabel(humanizeOpsText(st.name))}"]`)
        if (idx > 0) {
          lines.push(`  S${idx} --> ${sId}`)
        }
      })
      lines.push('```', '')

      lines.push('| 步骤 | 操作环节 | 页面交互与系统反馈 |', '| --- | --- | --- |')
      orderedSteps.forEach((st, idx) => {
        const name = humanizeOpsText(st.name).replace(/\|/g, '｜')
        const summary = humanizeOpsText(st.summary ?? '').replace(/\|/g, '｜').replace(/[\r\n]+/g, ' ').trim() || '—'
        lines.push(`| ${idx + 1} | **${name}** | ${summary} |`)
      })
      lines.push('')
    }
  }

  domains.forEach((domain, dIdx) => {
    const dName = humanizeOpsText(domain.name)
    lines.push(`## ${dIdx + 1}. ${dName}`, '')
    if (domain.summary?.trim()) {
      lines.push(humanizeOpsText(domain.summary.trim()), '')
    }
    const entities = (domain.domainMeta?.entities?.filter(Boolean) ?? []).map(humanizeEntityName)
    if (entities.length > 0) {
      lines.push(`- **管理内容**：${entities.map((e) => `\`${e}\``).join('、')}`)
    }
    const rules = (domain.domainMeta?.businessRules?.filter(Boolean) ?? []).map(humanizeOpsText)
    if (rules.length > 0) {
      lines.push('- **运营规则与操作注意事项**：')
      for (const rule of rules) {
        lines.push(`  - ${rule}`)
      }
    }
    const cross = (domain.domainMeta?.crossDomainInteractions?.filter(Boolean) ?? []).map(humanizeOpsText)
    if (cross.length > 0) {
      lines.push('- **跨板块业务影响**：')
      for (const item of cross) {
        lines.push(`  - ${item}`)
      }
    }
    if (entities.length > 0 || rules.length > 0 || cross.length > 0) {
      lines.push('')
    }

    const dFlows = flowsOfDomain.get(domain.id) ?? []
    dFlows.forEach((flow, fIdx) => {
      renderFlowBlock(flow, `${dIdx + 1}.${fIdx + 1}`, dName)
    })
  })

  const orphanFlows = flows.filter((f) => !assignedFlows.has(f.id))
  if (orphanFlows.length > 0) {
    lines.push('## 其他业务流程', '')
    orphanFlows.forEach((flow, idx) => {
      renderFlowBlock(flow, `F${idx + 1}`)
    })
  }

  return `${lines.join('\n').trim()}\n`
}

function safeName(raw: string): string {
  return raw.replace(/[\\/:*?"<>|]+/g, '-').trim() || '未命名项目'
}

export interface UaDomainExportResult {
  mdRel: string
  htmlRel: string
  htmlFullPath: string
}

/**
 * 从项目对应的图谱目录读取 domain-graph.json，同时生成：
 * 1) `项目/<项目名>/功能交互图.md`（供 Obsidian 阅读）
 * 2) `项目/<项目名>/<项目名>-产品功能交互说明.html`（单文件可视化流程图，可直接发给产品/运营同学双击打开或打印为 PDF）
 */
export function exportDomainInteractionToVault(opts: {
  vaultPath: string
  project: Pick<Project, 'name' | 'obsidianLink'>
  graphDir: string
  today: string
}): UaDomainExportResult {
  const domainFile = join(opts.graphDir, 'domain-graph.json')
  if (!existsSync(domainFile)) {
    throw new AppError(
      'UA_DOMAIN_MISSING',
      '还没有生成业务域图谱（domain-graph.json）。请先点「生成业务流程图」在终端运行 /understand-domain。'
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(domainFile, 'utf8'))
  } catch {
    throw new AppError('UA_DOMAIN_INVALID', '读取 domain-graph.json 失败，文件格式可能已损坏')
  }

  const markdown = renderDomainInteractionDoc(opts.project.name, parsed, opts.today)
  const html = renderDomainInteractionHtml(opts.project.name, parsed, opts.today)

  const folder = projectFolder(opts.project.obsidianLink)
  const relParts = folder.split('/').filter(Boolean)
  const folderRel = relParts.length > 1 ? relParts.join('/') : `项目/${safeName(opts.project.name)}`
  const mdRel = `${folderRel}/功能交互图.md`
  const htmlRel = `${folderRel}/${safeName(opts.project.name)}-产品功能交互说明.html`

  const root = resolve(opts.vaultPath)
  const mdFullPath = resolve(root, ...mdRel.split('/'))
  const htmlFullPath = resolve(root, ...htmlRel.split('/'))
  if (!mdFullPath.startsWith(root + sep) || !htmlFullPath.startsWith(root + sep)) {
    throw new AppError('VAULT_PATH', '导出路径超出 Vault 范围')
  }

  mkdirSync(dirname(mdFullPath), { recursive: true })
  writeFileSync(mdFullPath, markdown, 'utf8')
  writeFileSync(htmlFullPath, html, 'utf8')
  return { mdRel, htmlRel, htmlFullPath }
}
