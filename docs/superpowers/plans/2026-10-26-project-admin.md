# 第八期：项目管理实现计划

设计：vault `项目/workbench-desktop/2026-10-26-项目管理-design.md`

执行方式：本会话内联实现（用户已要求开始实现）。不提交，除非另行要求。

## Task 1 — 表格编辑

- [x] `repoMapEdit.ts`：`addRow` / `updateRow` / `removeRow` / `writtenType`，只改「已确认映射」表和 frontmatter `updated`
- [x] 单测：增删改、重复路径与名称、`|` 转义、未知类型标签保留、表格外逐字不变、重复行删除

## Task 2 — 类型判断、地址、主页、克隆

- [x] `detectType`、`shared/repoUrl.ts`、`homepage.ts`、`repoClone.ts`、`projectAdmin.ts`
- [x] 单测 + 本地 bare 仓库克隆集成测试（成功、目标非空拒绝、失败清理、取消）

## Task 3 — IPC 与设置

- [x] `ProjectWriteRequest`、`CloneProgress`、`Prefs.codeRoot`、`Project.typeLabel`
- [x] channels、preload、主进程 handlers；设置页「代码根目录」

## Task 4 — 界面

- [x] 侧栏 ＋、空状态「新增项目」、`ProjectDialog`（本地 / 克隆）、详情「编辑 / 移除」

## Task 5 — 验证

- [x] `pnpm test`、`pnpm typecheck`
- [x] 重启 dev，CDP 在临时 vault 上新增、编辑、移除、克隆；结束后切回 `D:\job\notes`
- [x] readme、项目主页状态
