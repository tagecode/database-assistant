import type { QueryColumn } from './query'

export type TableRef = {
  database?: string
  schema?: string
}

export type TableGetStructurePayload = {
  connectionId: string
  table: string
  kind: 'table' | 'view'
  ref?: TableRef
}

export type TableColumnInfo = {
  name: string
  dataType: string
  nullable: boolean
  defaultValue: string | null
  key: string | null
  extra: string | null
}

export type TableGetStructureData = {
  columns: TableColumnInfo[]
  indexes: Array<{
    name: string
    columns: string[]
    unique: boolean
  }>
  /** 部分数据库或对象类型下可能无完整 DDL */
  ddl: string | null
}

export type TableGetDataPayload = {
  connectionId: string
  table: string
  kind: 'table' | 'view'
  ref?: TableRef
  /** 1-based */
  page: number
  pageSize: number
  orderBy?: { column: string; direction: 'asc' | 'desc' }
}

export type TableGetDataData = {
  columns: QueryColumn[]
  rows: Record<string, unknown>[]
  total: number
  page: number
  pageSize: number
  durationMs: number
  /** 主键列名（按顺序）。为空表示表无主键，行级安全编辑将不可用。 */
  primaryKeyColumnNames: string[]
}

export type TableBaseRefPayload = {
  connectionId: string
  table: string
  kind: 'table' | 'view'
  ref?: TableRef
}

export type TableUpdateRowPayload = TableBaseRefPayload & {
  /** 仅当 kind === 'table' 时允许。主键列由主进程从库中解析。 */
  primaryKey: Record<string, unknown>
  changes: Record<string, unknown>
}

export type TableInsertRowPayload = TableBaseRefPayload & {
  row: Record<string, unknown>
}

export type TableDeleteRowPayload = TableBaseRefPayload & {
  primaryKey: Record<string, unknown>
}

export type TableRowMutationData = {
  /** 受影响行数（多为 1） */
  affected: number
}
