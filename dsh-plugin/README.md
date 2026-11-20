# @workbench/dsh-plugin

DeepSeek Harness Workbench Extension: 深度整合 TAPD 敏捷协同、微信小程序自动化发版/预览、Apifox 接口契约对齐、工作总结汇总及本地项目仓库注册表。

独立存放在 `workbench-desktop/dsh-plugin` 下，不污染 DSH 源码，支持随时热加载。

## 注册的智能体工具 (Tools)

| 工具名称 | 对应工作台模块 | 功能说明 |
|---|---|---|
| `workbench_list_projects` | 项目仓库注册表 | 读取 Obsidian `项目.md` 映射表，列出全部项目名称、类型、本地绝对路径、Git 可用状态与说明 |
| `tapd_list_tasks` | TAPD 待办列表 | 自动探测访问令牌，拉取分配给当前用户的需求、缺陷与任务列表 |
| `tapd_get_task_detail` | TAPD 详情与流转 | 查看单号详情、描述富文本转纯文本以及下一步可流转的状态列表 |
| `tapd_update_task_status` | TAPD 状态流转 | 更新需求/缺陷状态（如流转到「已解决」），支持追加处理备注 |
| `miniapp_detect_env` | 小程序多环境识别 | 检测项目根目录、AppID、多环境配置文件及可用构建脚本 |
| `miniapp_preview` | 小程序扫码预览 | 驱动微信开发者工具 CLI 编译并生成直接扫码的 Base64 预览二维码 |
| `miniapp_upload` | 小程序自动发版 | 校验/递增 SemVer 版本号，过滤安全发版日志并上传代码至微信平台 |
| `apifox_get_contract` | Apifox 契约对齐 | 解析 OpenAPI 3.0 文档，输出参数表格、响应结构与完整 TypeScript 接口 |
| `workbench_get_work_summary` | 日报/周报材料生成 | 自动汇总指定仓库的本地 Git 提交与已完成的 TAPD 历史任务 |

## 启动与挂载

### 1. Web 界面模式 (带补丁挂载)
在 `D:\job\code1\deepseek-harness` 目录下执行：
```bash
pnpm run dsh web --patch D:/job/code/workbench-desktop/dsh-plugin/cordis.patch.yml
```

挂载后，左侧全局面板增加「工作台」入口，打开项目、TAPD、小程序、接口和汇报的说明页。

### 2. 命令行 Headless 模式
```bash
pnpm run dsh --profile headless --patch D:/job/code/workbench-desktop/dsh-plugin/cordis.patch.yml "列出我登记的所有项目并检查可用状态"
```
