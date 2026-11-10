export type TapdKind = 'story' | 'bug' | 'task'

export interface TapdItem {
  /** `${kind}:${id}`，例如 `story:1016729` 或 `bug:1016730` */
  key: string
  kind: TapdKind
  id: string
  workspaceId: string
  workspaceName: string
  title: string
  status: string
  statusLabel: string
  iterationId: string | null
  iterationName: string | null
  owners: string[]
  priority: string | null
  modified: string
  url: string
  /** 任务所属需求 id */
  storyId?: string
  workitemTypeId?: string
}

export interface TapdHistoryItem extends TapdItem {
  done: boolean
}

export interface TapdWorkspace {
  id: string
  name: string
  enabled: boolean
}

export interface TapdBoard {
  user: string
  items: TapdItem[]
  workspaces: TapdWorkspace[]
  errors: { workspaceId: string; workspaceName: string; message: string }[]
  fetchedAt: number
}

export interface TapdTransition {
  to: string
  label: string
  /** 需要在 TAPD 中填写的必填字段；非空时不能在插件中直接流转 */
  blockedBy: string[]
}

export interface TapdDetail {
  item: TapdItem
  description: string
  transitions: TapdTransition[]
}
