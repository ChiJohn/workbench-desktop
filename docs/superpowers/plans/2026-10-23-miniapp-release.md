# 第三期：小程序构建发版 实现计划

设计：vault `Projects/workbench-desktop/2026-10-23-小程序构建发版-design.md`

原则：core 层先写测试；不在真实项目上执行上传；不做 git 写操作。

## Task 1 — 共享类型与 IPC 契约

- [x] `src/shared/types.ts`：`ReleaseAction`、`BuildChoice`、`ReleaseEnv`、`ReleaseInfo`、`ReleaseRequest`、`StepStatus`、`ReleaseStep`、`ReleaseJob`；`RepoPrefs.releaseEnvs` / `lastUploadVersion`；`Prefs.wechatDevtoolsToken`
- [x] `src/shared/ipc.ts`：`release.info` / `start` / `cancel` / `list`，事件 `release:changed`，`WorkbenchApi.release`

## Task 2 — Runner 支持任意命令

- [x] 测试：`startCommand` 输出、退出码、env 透传、空命令拒绝
- [x] 实现 `RunnerService.startCommand({ projectId, label, command, cwd, env })`，与 `start` 共用 `spawnSession`

## Task 3 — releaseConfig

- [x] 测试并实现 `detectEnvs(scripts, overrides)`：`build:weapp*` 过滤、排序、别名/隐藏
- [x] `bumpPatch(version)`、`isValidVersion`
- [x] `sanitizeDesc(text)`：`"`→`'`、`%`→`％`、换行→空格、截断 200
- [x] `defaultDesc(status)`：`分支 短hash 提交信息`

## Task 4 — projectDir

- [x] 测试并实现 `resolveProjectDir(root)`：读 `project.config.json`；`miniprogramRoot` 指向的目录含 `project.config.json` 时用该目录；返回 `{ dir, appid }`；缺失 → `PROJECT_CONFIG_NOT_FOUND`

## Task 5 — cliCommand

- [x] 测试并实现 `buildCliCommand(cli, { kind, projectDir, version, desc, qrOutput, infoOutput })`：引号、`--lang zh`、校验 `INVALID_PATH` / `INVALID_VERSION`

## Task 6 — ReleaseService

- [x] 沙箱假 `cli.bat` fixture：打印参数；`preview` 写 base64 二维码；`upload` 写 info JSON；环境变量 `FAKE_CLI_FAIL=<kind>` 时退出码 1
- [x] 测试：预览成功（qrDataUrl）、上传成功（sizeKb + onUploaded 回调）、构建失败停止、跳过构建、取消、`RELEASE_RUNNING`、`APPID_CHANGED`、cli 未配置
- [x] 实现编排与 `changed` 事件

## Task 7 — 主进程接线

- [x] `services.ts`：`ReleaseService`；开发者工具路径探测（候选路径 + 注册表 InstallLocation）
- [x] `ipc.ts`：`release.*` handler；`release.info` 组装 envs / 默认版本 / 默认描述 / 改动数；上传成功写回 `lastUploadVersion`；转发 `release:changed`
- [x] `preload`：`api.release`

## Task 8 — 渲染层

- [x] `stores/releases.ts`（按 projectId 保存最新 job）、`useGlobalEvents` 订阅、启动时 `release.list` 恢复
- [x] `queries.ts`：`useReleaseInfo`、`startRelease`、`cancelRelease`
- [x] `ReleaseCard`：环境下拉、预览 / 上传按钮、步骤条（点击跳日志）、二维码、取消
- [x] `UploadDialog`：版本号、描述、确认区（appid、分支、提交、未提交改动红字）
- [x] `ReleaseEnvSettings`：别名 / 隐藏
- [x] Settings 页：CLI 令牌输入
- [x] 样式

## Task 9 — 验证与文档

- [x] `pnpm test`、`pnpm typecheck`
- [x] CDP：沙箱小程序项目 + 假 cli 走通预览 / 上传 / 失败 / 取消
- [x] 实测真实 CLI 失败时的退出码（只用不存在的项目路径，不上传）
- [x] 更新 readme、vault 主页与知识沉淀，提交
- [ ] 人工验收：开启开发者工具服务端口后，在一个真实小程序上做一次预览（不影响线上版本），确认二维码与包大小单位
