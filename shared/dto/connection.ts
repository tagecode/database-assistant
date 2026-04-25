export type DatabaseKind = 'mysql' | 'postgres' | 'sqlite'

/**
 * 持久化在磁盘中的连接元数据（不含密码）
 */
export interface ConnectionRecord {
  id: string
  name: string
  type: DatabaseKind
  favorite: boolean
  group: string | null
  host?: string
  port?: number
  user?: string
  database?: string
  filePath?: string
  createdAt: string
  updatedAt: string
}

export type ConnectionListPayload = { connections: ConnectionRecord[] }

export type ConnectionFormFields = {
  name: string
  type: DatabaseKind
  favorite: boolean
  group: string
  host: string
  port: string
  user: string
  /** 空字符串在「创建」时视为无密码；在「更新」时视为不修改已存密码 */
  password: string
  database: string
  filePath: string
}

export type ConnectionCreatePayload = {
  fields: ConnectionFormFields
}

export type ConnectionUpdatePayload = {
  id: string
  fields: ConnectionFormFields
}

export type ConnectionDeletePayload = {
  id: string
}

/**
 * 测试已保存连接，或仅草稿（未保存前）
 */
export type ConnectionTestPayload =
  | { kind: 'saved'; id: string }
  | { kind: 'draft'; fields: ConnectionFormFields }

export type SqliteFilePickResult = { path: string } | null
