# 第四期：任务中心 实现计划

设计：vault `Projects/workbench-desktop/2026-10-24-任务中心-design.md`

原则：core 先写测试；TAPD 状态流转不在真实单子上执行；任务卡验证只写沙箱 vault。

## Task 1 — 类型、IPC 契约、prefs 合并

- [x] `TapdKind`、`TapdItem`、`TapdBoard`、`TapdDetail`、`TapdTransition`、`TapdStatus`；`Prefs.tapdTokenEnc`、`Prefs.tapd`
- [x] `tapd.*` channels，事件 `tapd:updated` / `tapd:focus`
- [x] `PrefsStore.update` 合并 `tapd.iterationRepos` / `itemRepos`（空字符串表示删除）；测试
- [x] `settings.get` 不下发 `tapdTokenEnc`，`settings.set` 忽略它

## Task 2 — normalize

- [x] `splitOwners`、`hasOwner`、`htmlToText`（段落 / 换行 / 列表 / 链接 / 相对图片地址 / 实体）
- [x] `itemUrl`、`normalizeStory` / `normalizeBug` / `normalizeTask`（`iteration_id` 为 `0` 视为无迭代）

## Task 3 — tapdClient

- [x] 假 fetch 测试：Bearer 头、查询参数、`status != 1` → `TAPD_ERROR`、401/422 令牌无效 → `TAPD_UNAUTHORIZED`、超时 / 网络 → `TAPD_NETWORK`、`listAll` 翻页、POST 表单

## Task 4 — tapdService

- [x] `board(force)`：用户、项目过滤、三类列表、本地 owner 复核、终态过滤、状态名、迭代名、单项目失败隔离、元数据缓存
- [x] `detail(key)`：正文、可流转状态（必填字段阻塞）
- [x] `transition(key, to)`：校验允许列表后 POST，清该项目缓存

## Task 5 — seenStore / tokenSource / taskCard

- [x] `diffNew(prevKeys | null, items)`；JSON 文件读写
- [x] `readMcpToken(file)`：UTF-8 / UTF-16 BOM
- [x] 任务卡：目录推导、文件名清洗与重名、内容模板、按 `tapd_id` 查找

## Task 6 — 主进程

- [x] 令牌：safeStorage 加解密，启动时从 mcp.json 导入
- [x] IPC handlers；`app.openExternal` 放行 `obsidian:`
- [x] `TapdPoller`：15 分钟、通知（合并多条）、点击聚焦

## Task 7 — 渲染层

- [x] 「任务」视图：筛选、按迭代分组、组标题仓库下拉、刷新
- [x] 详情面板：正文、打开 TAPD、去仓库、任务卡、状态流转（确认）
- [x] 设置：TAPD 令牌（替换 / 清除）、项目勾选
- [x] 通知点击跳转

## Task 8 — 验证与文档

- [x] `pnpm test`、`pnpm typecheck`
- [x] CDP：真实 TAPD 只读走查；任务卡写入沙箱 vault
- [x] readme、vault 主页、知识沉淀；提交
- [ ] 人工验收：状态流转、系统通知
