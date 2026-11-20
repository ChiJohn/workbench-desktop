window.__ModuleLoader__.load({
  id: '@workbench/dsh-plugin',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'workbench'
    const PANEL_ID = 'workbench'
    const zh = {
      panel: '工作台',
      title: '工作台',
      lead: '项目、TAPD、小程序发版、接口契约和汇报，从左侧这一项进入。',
      'project.title': '项目',
      'project.body': '读取 Obsidian 项目.md，列出登记的仓库、本地路径和 Git 是否可用。',
      'tapd.title': 'TAPD',
      'tapd.body': '查看分配给我的需求、缺陷和任务，并按允许的下一步流转状态。',
      'miniapp.title': '小程序',
      'miniapp.body': '识别构建环境，生成预览二维码，或上传体验版。',
      'api.title': '接口',
      'api.body': '按 Apifox 契约整理参数、响应和 TypeScript 类型。',
      'report.title': '汇报',
      'report.body': '汇总仓库提交和已完成的 TAPD，作为日报、周报的素材。'
    }
    const en = {
      panel: 'Workbench',
      title: 'Workbench',
      lead: 'Projects, TAPD, mini program release, API contracts, and reports open from this sidebar entry.',
      'project.title': 'Projects',
      'project.body': 'Read the Obsidian project map and list each repo, its path, and whether Git is usable.',
      'tapd.title': 'TAPD',
      'tapd.body': 'See stories, bugs, and tasks assigned to you, and move them through the allowed next status.',
      'miniapp.title': 'Mini program',
      'miniapp.body': 'Detect the build environment, make a preview QR code, or upload a trial build.',
      'api.title': 'APIs',
      'api.body': 'Turn an Apifox contract into parameters, responses, and TypeScript types.',
      'report.title': 'Reports',
      'report.body': 'Collect repository commits and finished TAPD items for daily and weekly notes.'
    }
    const sections = ['project', 'tapd', 'miniapp', 'api', 'report']

    function WorkbenchIcon({ size }) {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        'aria-hidden': true
      }, [2.5, 9].flatMap((y) => [2.5, 9].map((x) => h('rect', {
        key: `${x}-${y}`,
        x, y, width: 4.5, height: 4.5, rx: 0.7,
        fill: 'currentColor'
      }))))
    }

    function WorkbenchPage({ t }) {
      return h('main', { className: 'wb-page' },
        h('style', null, PAGE_CSS),
        h('div', { className: 'wb-head' },
          h('h1', { className: 'wb-title' }, t('title')),
          h('p', { className: 'wb-lead' }, t('lead'))
        ),
        h('ul', { className: 'wb-list' }, sections.map((id) => h('li', { key: id, className: 'wb-card' },
          h('h2', null, t(`${id}.title`)),
          h('p', null, t(`${id}.body`))
        )))
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'workbench: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS
        }, function WorkbenchPanel() {
          return h(WorkbenchPage, { t })
        }))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: () => t('panel')
        }, WorkbenchIcon))
      }
    }
  }
})

const PAGE_CSS = `
.wb-page {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  padding: 28px clamp(24px, 4vw, 48px) 48px;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.wb-head, .wb-list { width: 100%; max-width: 720px; margin: 0 auto; }
.wb-title { margin: 0; font-size: 20px; font-weight: 500; line-height: 28px; }
.wb-lead { margin: 4px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.wb-list { display: grid; gap: 12px; margin-top: 28px; padding: 0; list-style: none; }
.wb-card {
  padding: 16px 18px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
}
.wb-card h2 { margin: 0; font-size: 14px; font-weight: 500; line-height: 22px; }
.wb-card p { margin: 4px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
`
