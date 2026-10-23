# 底座 + 仓库面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个 Electron 桌面工作台：读取 `仓库映射.md` 展示项目，提供仓库状态总览、一键打开、脚本运行、常用 git 操作、托盘与全局快捷键。

**Architecture:** 业务逻辑写在不依赖 Electron 的 `src/core`（可用 Vitest 独立测试），主进程把 core 注册为 IPC，preload 用 `contextBridge` 暴露类型化 `window.api`，React 界面只通过 `window.api` 访问能力。

**Tech Stack:** Electron、electron-vite、React、TypeScript、TanStack Query、zustand、xterm.js、Vitest。

**Spec:** `D:\job\code\notes\AI-Workbench\Projects\workbench-desktop\2026-10-23-底座与仓库面板-design.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/shared/types.ts` | 跨进程共享的数据类型 |
| `src/shared/ipc.ts` | IPC 通道名与 `WorkbenchApi` 接口 |
| `src/core/result.ts` | `AppError`、`Result` 构造与包装 |
| `src/core/exec.ts` | 带超时的外部命令执行 |
| `src/core/paths.ts` | 仓库路径规范化 |
| `src/core/concurrency.ts` | 并发上限的 `mapLimit` |
| `src/core/registry/parseRepoMap.ts` | 解析 `仓库映射.md`（纯函数） |
| `src/core/registry/registryService.ts` | 读取、可用性检查、文件监听 |
| `src/core/prefs/prefsStore.ts` | 本地偏好读写 |
| `src/core/git/parseStatus.ts` | porcelain v2 / log / branch 输出解析（纯函数） |
| `src/core/git/gitService.ts` | git 命令调用 |
| `src/core/runner/lineBuffer.ts` | 按行上限的环形日志缓冲 |
| `src/core/runner/packageScripts.ts` | 包管理器识别与 scripts 读取 |
| `src/core/runner/killTree.ts` | 进程树清理 |
| `src/core/runner/runnerService.ts` | 脚本进程管理与日志批量推送 |
| `src/core/launcher/launchCommand.ts` | 打开方式命令拼装（纯函数） |
| `src/core/launcher/launcherService.ts` | 执行打开命令、小程序根目录探测 |
| `src/main/*` | 窗口、托盘、快捷键、IPC 注册 |
| `src/preload/index.ts` | `window.api` |
| `src/renderer/*` | React 界面 |

## Tasks

### Task 1: 工程脚手架
- [x] `package.json`、`electron.vite.config.ts`、`tsconfig*.json`、`vitest.config.ts`、`.gitignore`、`pnpm-workspace.yaml`
- [x] 安装依赖（`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`）
- [x] 最小 main / preload / renderer 能 `pnpm dev` 打开窗口；`pnpm typecheck` 通过
- [x] Commit `chore: scaffold electron-vite + react app`

### Task 2: 共享类型与基础设施
- [x] `shared/types.ts`、`shared/ipc.ts`、`core/result.ts`、`core/paths.ts`、`core/concurrency.ts`、`core/exec.ts`
- [x] 测试：`paths.test.ts`（大小写、斜杠、尾部斜杠）、`concurrency.test.ts`（并发不超过上限、结果顺序保持）、`exec.test.ts`（成功、非零退出码、命令不存在抛 `COMMAND_NOT_FOUND`、超时 `timedOut`）
- [x] Commit `feat(core): shared types and infra`

### Task 3: 映射表解析与注册表
- [x] 测试先行 `parseRepoMap.test.ts`：以真实映射表副本为 fixture；断言项目数（去重后）、名称取自 wikilink、类型映射、重复行进入 skipped、只取「已确认映射」第一张表、wikilink 内转义竖线、缺路径行跳过、缺章节时返回空并给原因
- [x] 实现 `parseRepoMap.ts`
- [x] `registryService.test.ts`：临时 vault 目录；不存在映射文件抛 `MAP_NOT_FOUND`；路径不存在 / 非 git 仓库标记 unavailable；`require(id)` 对未知项目抛 `PROJECT_NOT_FOUND`；修改文件后触发 `changed`
- [x] 实现 `registryService.ts`
- [x] Commit `feat(core): repo map registry`

### Task 4: 偏好存储
- [x] 测试 `prefsStore.test.ts`：文件不存在返回默认值；损坏 JSON 回退默认值；`update` 顶层浅合并、`repos` 按仓库合并；写入后可重新读取
- [x] 实现 `prefsStore.ts`
- [x] Commit `feat(core): prefs store`

### Task 5: git 服务
- [x] 测试 `parseStatus.test.ts`：普通分支 + upstream + ab、detached、无 upstream、initial、改动计数（1/2/u/? 行）、log 解析、branch 列表解析（过滤 detached 项）
- [x] 实现 `parseStatus.ts`
- [x] 集成测试 `gitService.test.ts`：临时目录 `git init`、提交、改文件后 status、建分支、切分支、非法分支名、空仓库 lastCommit 为 null
- [x] 实现 `gitService.ts`（`GIT_TERMINAL_PROMPT=0`、`GCM_INTERACTIVE=never`、超时）
- [x] Commit `feat(core): git service`

### Task 6: 脚本运行器
- [x] 测试 `lineBuffer.test.ts`、`packageScripts.test.ts`（lock 文件识别、无 package.json、非法 JSON）
- [x] 集成测试 `runnerService.test.ts`：临时项目 `npm run serve`，脚本会再拉起一个常驻孙进程；断言 output 事件、`ALREADY_RUNNING`、未知脚本 `SCRIPT_NOT_FOUND`、stop 后 exit 事件触发且孙进程被清理
- [x] 实现 `lineBuffer.ts`、`packageScripts.ts`、`killTree.ts`、`runnerService.ts`
- [x] Commit `feat(core): script runner`

### Task 7: 外部工具启动器
- [x] 测试 `launchCommand.test.ts`：四种打开方式的命令字符串、powershell 单引号转义、wechat 未配置抛错；`findMiniprogramRoot` 根目录 / 一级子目录 / 回退
- [x] 实现 `launchCommand.ts`、`launcherService.ts`
- [x] Commit `feat(core): launcher`

### Task 8: 主进程与 preload
- [x] `main/services.ts` 组装服务；`main/ipc.ts` 注册全部通道并转发事件；`main/tray.ts`；`main/hotkey.ts`；`main/index.ts`（单实例、关闭隐藏到托盘、退出前确认并清理脚本）
- [x] `preload/index.ts` 暴露 `window.api`
- [x] `pnpm typecheck` 通过
- [x] Commit `feat(main): ipc, tray, hotkey`

### Task 9: 界面
- [x] 查询与状态：`api.ts`（unwrap）、`queries.ts`、`stores/ui.ts`、`stores/runs.ts`、`stores/toast.ts`、`terminals.ts`
- [x] 组件：`Toolbar`、`ProjectList`、`Overview`、`ProjectDetail`（分支切换、新建分支内联输入、打开方式、脚本列表）、`LogPanel`、`Settings`、`EmptyState`、`Toasts`
- [x] `pnpm typecheck`、`pnpm build` 通过
- [x] Commit `feat(renderer): repo panel ui`

### Task 10: 验收
- [x] `pnpm test` 全绿
- [x] `pnpm dev` 按 spec 第 11 节验收：1、2、3、7 已通过 CDP 自动验证
- [ ] 需人工验收：托盘常驻与退出清理（第 4 条）、全局快捷键（第 5 条）、四种打开方式实际弹出窗口（第 6 条）
- [x] 更新 vault：仓库映射加入本仓库、项目主页、知识沉淀
