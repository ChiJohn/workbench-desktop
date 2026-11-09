# 新建分支时可指定基分支

## 背景

当前「新建分支」通过 `git switch -c <name>` 基于 **HEAD（当前分支）** 创建。用户希望创建时能手选本地基分支，创建后仍切换到新分支。

## 目标

- 创建分支时必须选择一个本地基分支
- 创建成功后切换到新分支（保持「创建并切换」）
- 不引入远程跟踪分支作为基分支选项

## 非目标

- 不支持从 `origin/*` 等远程跟踪分支直接创建
- 不预选默认基分支（如 `main` / 当前分支）
- 不为 createBranch 新增脏工作区前置检查（继续依赖 `git switch` 自身错误）

## UI

位置：项目详情页现有行内「新建分支」表单（`ProjectDetail`）。

展开后包含：

1. 基分支 `<select>`
   - 占位文案：「选择基分支」
   - 选项：该项目本地分支列表
   - 打开表单时拉取分支列表，复用现有 `useBranches`
   - **不预选**任何项，必须手选
2. 新分支名输入框（占位 `feature/xxx`，行为与现有一致）
3. 「创建并切换」/「取消」按钮；Escape 取消

校验：基分支未选或新分支名为空时不提交。

## 后端与数据流

1. `GitService.createBranch(repoPath, branch, startPoint)`
   - 对 `branch`、`startPoint` 均调用现有 `assertBranchName`
   - 执行：`git switch -c <branch> <startPoint>`
2. IPC 通道 `git.createBranch`、preload、`WorkbenchApi.git.createBranch` 增加 `startPoint: string` 参数
3. 前端 `useGitAction` 的 `createBranch` action 携带所选基分支并下发

错误处理：

- 非法分支名 → `INVALID_BRANCH`
- 基分支不存在 / git 失败 → 现有 `GIT_FAILED` + toast

## 测试

`gitService` 单测补充：

- 从指定本地分支创建并切换成功（新分支指向基分支 tip，且当前分支为新分支）
- 非法 `startPoint` 或新分支名 → `INVALID_BRANCH`
- 基分支不存在 → `GIT_FAILED`

前端：未选手选基分支或名称为空时不发起 IPC。

## 涉及文件（预期）

- `src/core/git/gitService.ts` / `gitService.test.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/ipc.ts`
- `src/renderer/src/queries.ts`
- `src/renderer/src/components/ProjectDetail.tsx`
