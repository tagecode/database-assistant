import type { ConnectionRecord, DatabaseKind } from '../dto/connection'
import type { ExplorerNodeDto } from '../dto/explorer'
import type { QueryContext, QueryExecuteData, QueryExecuteResult } from '../dto/query'
import type {
  TableGetDataData,
  TableGetStructureData,
  TableRef,
  TableRowMutationData,
} from '../dto/table'

export type ResolvedConnectionTestInput = {
  type: DatabaseKind
  host?: string
  port?: number
  user?: string
  database?: string
  filePath?: string
  password: string
}

export interface DatabaseAdapterCapabilities {
  queryCancel: boolean
  rowMutation: boolean
}

export interface DatabaseAdapter {
  type: DatabaseKind
  capabilities: DatabaseAdapterCapabilities
  testConnection(input: ResolvedConnectionTestInput): Promise<void>
  loadExplorerChildren(
    record: ConnectionRecord,
    parentKey: string | null,
  ): Promise<ExplorerNodeDto[]>
  executeQuery(
    record: ConnectionRecord,
    sql: string,
    pageSize: number,
    queryRunId?: string,
    queryContext?: QueryContext,
  ): Promise<QueryExecuteResult>
  fetchQueryPage(
    record: ConnectionRecord,
    sql: string,
    page: number,
    pageSize: number,
    queryRunId?: string,
    queryContext?: QueryContext,
  ): Promise<QueryExecuteData>
  getTableStructure(
    record: ConnectionRecord,
    table: string,
    kind: 'table' | 'view',
    ref: TableRef | undefined,
  ): Promise<TableGetStructureData>
  getTableData(
    record: ConnectionRecord,
    table: string,
    kind: 'table' | 'view',
    ref: TableRef | undefined,
    page: number,
    pageSize: number,
  ): Promise<TableGetDataData>
  getPrimaryKeyColumnNames(
    record: ConnectionRecord,
    table: string,
    ref: TableRef | undefined,
  ): Promise<string[]>
  updateTableRow(
    record: ConnectionRecord,
    table: string,
    kind: 'table' | 'view',
    ref: TableRef | undefined,
    primaryKey: Record<string, unknown>,
    changes: Record<string, unknown>,
    primaryKeyColumnNames: string[],
  ): Promise<TableRowMutationData>
  insertTableRow(
    record: ConnectionRecord,
    table: string,
    kind: 'table' | 'view',
    ref: TableRef | undefined,
    row: Record<string, unknown>,
  ): Promise<TableRowMutationData>
  deleteTableRow(
    record: ConnectionRecord,
    table: string,
    kind: 'table' | 'view',
    ref: TableRef | undefined,
    primaryKey: Record<string, unknown>,
    primaryKeyColumnNames: string[],
  ): Promise<TableRowMutationData>
}
