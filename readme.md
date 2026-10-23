# workbench-desktop

个人前端开发工作台（Electron + React + TypeScript）。从 Obsidian vault 的 `Projects/仓库映射.md` 读取项目列表，提供仓库状态总览、一键打开、脚本运行、常用 git 操作，小程序构建、预览与上传体验版，以及 TAPD 任务中心。

## 使用

```bash
pnpm install
pnpm dev                     # 开发模式，F12 打开 DevTools
pnpm build && pnpm preview   # 以构建产物运行
```

首次安装时 pnpm 不会自动下载 Electron 二进制，执行：

```bash
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

- 全局快捷键默认 `Ctrl+Alt+W` 唤起 / 隐藏窗口，可在「设置」修改
- 关闭窗口会隐藏到托盘，正在运行的脚本不受影响；从托盘「退出」会先确认并停止所有脚本
- 偏好保存在 `%APPDATA%/workbench-desktop/prefs.json`；调试时可用环境变量 `WORKBENCH_USER_DATA` 指向其他目录

### 小程序发版

小程序项目的详情页有「小程序发版」卡片：选择构建环境（自动识别 `build:weapp*` 脚本，原生项目为「构建 npm」）后点「预览」或「上传体验版」，流水线为 构建 → 预览 / 上传，日志进入下方日志面板。

- 调用本机微信开发者工具 CLI（`cli.bat`），启动时自动探测安装位置，也可在「设置」中指定
- 需要在开发者工具中登录，并在「设置 → 安全设置」开启服务端口
- 上传版本号默认取上次上传 +1；描述默认 `分支 短hash 提交信息`
- 构建后会复核 `project.config.json` 中的 appid（Taro 以 `dist/` 中的为准），与确认时不一致会停止上传
- CLI 出错时退出码可能仍为 0，因此以输出中的 `[error]` / `×` 判断失败

### 任务中心

工具栏「任务」页汇总 TAPD 上分配给我的未完成需求、缺陷和任务，按项目和迭代分组。

- 令牌首次启动时从 `~/.cursor/mcp.json`（`mcp-server-tapd` 的 `TAPD_ACCESS_TOKEN`）导入，也可在「设置 → TAPD」替换或清除；以系统加密（safeStorage）保存在 prefs 中，界面拿不到明文
- 默认包含参与的全部项目（排除组织和示例空间），可在设置中取消勾选
- 迭代分组标题处手动选择关联仓库，未规划迭代的单子在详情面板中单独选择；关联后可「去仓库」和「生成任务卡」
- 任务卡写到 vault 中对应项目目录 `Projects/<项目>/task-YYYYMMDD-标题.md`，同一单子已有卡片时直接打开
- 状态流转只列工作流允许的下一状态，有必填字段的流转需要到 TAPD 中操作；提交前二次确认
- 每 15 分钟后台刷新一次，有新分配的单子时发系统通知，点击通知跳到该单子

## 开发

```bash
pnpm test        # src/core 的单元与集成测试（会在临时目录创建真实 git 仓库和子进程）
pnpm typecheck
```

结构：`src/core` 为不依赖 Electron 的业务服务，`src/main` 注册 IPC、托盘与快捷键，`src/preload` 暴露 `window.api`，`src/renderer` 为 React 界面。设计文档见 vault 中 `Projects/workbench-desktop/`。
