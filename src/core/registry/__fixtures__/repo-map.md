---
type: repo-map
status: active
created: 2026-05-26
updated: 2026-10-16
---

# 仓库映射

这个文件用于记录 Obsidian 项目与本机代码仓库的对应关系，方便 Codex CLI 接到自然语言任务后自动定位代码目录、项目任务笔记和知识沉淀位置。

## 已确认映射

| Obsidian 项目                    | 代码仓库 / 入口目录                                               | 类型      | 说明                                   |
| ------------------------------ | --------------------------------------------------------- | ------- | ------------------------------------ |
| [[Projects/easygoods_mini/主页]] | `D:\job\code\flash-purchase-store-miniapp\apps\easyGoods` | 小程序应用   | easyGoods 小程序，已迁移为独立单项目仓库。           |
| [[Projects/恒优选小程序/主页]]         | `D:\job\code\material-mp`                                 | 小程序应用   | 恒优选微信小程序。                            |
| [[Projects/恒优选后台/主页]]          | `D:\job\code\material-platform`                           | 后台前端仓库  | 恒优选后台管理端。                            |
| [[Projects/saas平台端/主页]]        | `D:\job\code\saas-basic-platform-frontend`                | 后台前端仓库  | saas 平台端前端项目。                        |
| [[Projects/恒优选H5/主页]]          | `D:\job\code\hyx-h5`                                      | H5 应用   | 恒优选 H5 / 移动端 Web。                    |
| [[Projects/旅游小程序/主页]]          | `D:\job\code\flash-purchase-store-miniapp\apps\Travel`    | 小程序应用   | 旅游小程序，已迁移为独立单项目仓库。                   |
| [[Projects/officialH5/主页]]     | `D:\job\code\officialH5`                                  | H5 应用   | 微信公众号 H5，已迁移为独立单项目仓库。                |
| [[Projects/稽核中心H5/主页]]         | `D:\job\code\bank-transfer-audit-h5`                      | H5 应用   | 银行转账审核 H5。                           |
| [[Projects/稽核中心H5/主页]]         | `D:\job\code\bank-transfer-audit-h5`                      | H5 应用   | 稽核中心 H5，与稽核H5 指向同一仓库。                |
| [[Projects/easygoods_PC/主页]]   | `D:\job\code\enterprise-mall`                             | PC 前端仓库 | easyGoods / 企业商城 PC 端参考仓库。           |
| [[Projects/旅游后台/主页]]           | `D:\job\code\travel-manage-admin`                         | 后台前端仓库  | 旅游后台管理端。                             |
| [[Projects/佣金中心/主页]]           | `D:\job\code\commission-center-admin`                     | 后台前端仓库  | 佣金中心后台管理端。                           |
| [[Projects/支付中心/主页]]           | `D:\job\code\payment-center`                              | 后台前端仓库  | 支付中心后台管理端。                           |
| [[Projects/驴充充后台/主页]]          | `D:\job\code\lvcc-manage-admin`                           | 后台前端仓库  | 驴充充后台管理端。                            |
| [[Projects/驴充充小程序/主页]]        | `D:\job\code\lv-charge`                                  | 小程序应用   | 驴充充 / 白驹智充小程序，Taro + React + TypeScript。      |
| [[Projects/我家灯火小程序/主页]]      | `D:\job\code\domus_miniapp`                               | 小程序应用   | 我家灯火 / 新业主小程序，Taro + React + TypeScript。 |
| [[Projects/ai招标/主页]]           | `D:\job\code\investment-ui`                               | 前端仓库    | AI 招标项目对应仓库。                         |
| [[Projects/cli/主页]]            | `D:\job\code\cli`                                         | CLI 仓库  | Go CLI 项目，对应 `Projects/cli/` 下的项目沉淀。 |

## 暂不需要代码仓库映射

以下 Obsidian 项目当前先不绑定代码仓库：

- [[Projects/111/主页]]
- [[Projects/golang/主页]]

以下本机仓库当前先忽略：

- `D:\job\code\dev-workbench`
- `D:\job\code\duojing-basic-admin`
- `D:\job\code\flash-purchase-store-admin`
- `D:\job\code\test`

## 使用约定

1. 接到项目开发任务时，先根据本文件定位对应仓库。
2. 项目任务笔记统一放到 `Projects/<项目名>/task-YYYYMMDD-<标题>.md`。
3. 如果任务来自 `Tasks/Inbox`，需要在 Inbox 父任务和项目子任务之间互相链接。
4. 可复用经验沉淀到 `Projects/<项目名>/知识沉淀.md`。
5. 如果仓库路径不在本文件中，先向用户确认，不要猜测后直接改代码。




