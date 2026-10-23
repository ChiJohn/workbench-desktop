# workbench-desktop

个人前端开发工作台（Electron + React + TypeScript）。从 Obsidian vault 的 `Projects/仓库映射.md` 读取项目列表，提供仓库状态总览、一键打开、脚本运行和常用 git 操作。

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

## 开发

```bash
pnpm test        # src/core 的单元与集成测试（会在临时目录创建真实 git 仓库和子进程）
pnpm typecheck
```

结构：`src/core` 为不依赖 Electron 的业务服务，`src/main` 注册 IPC、托盘与快捷键，`src/preload` 暴露 `window.api`，`src/renderer` 为 React 界面。设计文档见 vault 中 `Projects/workbench-desktop/`。
