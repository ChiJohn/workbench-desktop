# 第五期：对接 multica 实现计划

设计：vault `Projects/workbench-desktop/2026-10-24-对接multica-design.md`

## Task 1 — 类型与 IPC 契约

- [x] `MulticaIssue`、`MulticaAgent`、`MulticaProject`、`MulticaRuntime`、`MulticaOverview`、`MulticaComment`、`MulticaIssueDetail`、`MulticaDispatchRequest`、`MulticaCommitRequest`、`WorktreeChange`；`Prefs.multica`
- [x] `multica.*`、`git.changes` / `git.diff` channels 与 preload
- [x] `PrefsStore` 合并 `multica.projectMap`

## Task 2 — multicaCli

- [x] 定位 CLI 与 profile（可注入 env / fs）
- [x] `json(args)`：拼 `--profile` / `--workspace-id` / `--output json`，解析 JSON
- [x] 错误映射：缺失、未登录、退出码 4、超时、其他
- [x] `withTempFile(content, fn)`：临时目录 + cwd

## Task 3 — projectMatch

- [x] 手工映射 > 描述含仓库路径（最长）> 标题等于 vault 目录名

## Task 4 — multicaService

- [x] overview：工作区选择、元数据缓存、五个状态分页拉取、负责人名、项目对应、守护进程与本机运行时
- [x] issue 详情：描述、评论、结论（最后一条智能体评论）
- [x] findByTapd、dispatch（描述模板、metadata、失败提示）、comment（@智能体）、complete（`--no-start`）

## Task 5 — git 与任务卡

- [x] `GitService.changes / diff / commitFiles`（只接受改动列表里的文件），临时仓库集成测试
- [x] 任务卡：通用渲染、`setFrontmatter`、`appendToSection`、`replaceSection`、`backfillCard`

## Task 6 — 主进程

- [x] services 组装、IPC handlers；complete 顺序：提交 → 标完成 → 回填
- [x] `launchDesktop`

## Task 7 — 渲染层

- [x] 「智能体」页、详情面板、审查区（diff、打回、通过、通过并提交）
- [x] 仓库详情「智能体任务」卡片
- [x] TAPD 详情「派给智能体」/「已派单」
- [x] 设置：CLI 状态、工作区、项目映射

## Task 8 — 验证与文档

- [x] `pnpm test`、`pnpm typecheck`
- [x] CDP：真实 multica 只读走查；写操作只在「水星」工作区；提交只在沙箱仓库
- [x] readme、vault 主页、知识沉淀、spec 状态；提交
- [x] 人工验收：真实派单给智能体、真实审核通过并提交
