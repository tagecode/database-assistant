import type { ApiResult } from '@shared/dto/api-result'
import type { AppLogAppendData, AppLogAppendPayload } from '@shared/dto/app-log'
import type {
  ConnectionCreatePayload,
  ConnectionDeletePayload,
  ConnectionListPayload,
  ConnectionRecord,
  ConnectionTestPayload,
  ConnectionUpdatePayload,
} from '@shared/dto/connection'
import type {
  ExplorerLoadChildrenData,
  ExplorerLoadChildrenPayload,
} from '@shared/dto/explorer'
import type {
  QueryCancelData,
  QueryCancelPayload,
  QueryExecuteData,
  QueryExecuteResult,
  QueryExecutePayload,
  QueryFetchPagePayload,
} from '@shared/dto/query'
import type {
  TableDeleteRowPayload,
  TableGetDataData,
  TableGetDataPayload,
  TableGetStructureData,
  TableGetStructurePayload,
  TableInsertRowPayload,
  TableRowMutationData,
  TableUpdateRowPayload,
} from '@shared/dto/table'

export type ConnectionsAPI = {
  list: () => Promise<ApiResult<ConnectionListPayload>>
  create: (payload: ConnectionCreatePayload) => Promise<
    ApiResult<{ connection: ConnectionRecord }>
  >
  update: (payload: ConnectionUpdatePayload) => Promise<
    ApiResult<{ connection: ConnectionRecord }>
  >
  remove: (payload: ConnectionDeletePayload) => Promise<ApiResult<void>>
  test: (payload: ConnectionTestPayload) => Promise<ApiResult<{ ok: true }>>
  pickSqliteFile: () => Promise<ApiResult<{ path: string } | null>>
}

export type ExplorerAPI = {
  loadChildren: (
    payload: ExplorerLoadChildrenPayload,
  ) => Promise<ApiResult<ExplorerLoadChildrenData>>
}

export type QueryAPI = {
  execute: (payload: QueryExecutePayload) => Promise<ApiResult<QueryExecuteResult>>
  fetchPage: (payload: QueryFetchPagePayload) => Promise<ApiResult<QueryExecuteData>>
  cancel: (payload: QueryCancelPayload) => Promise<ApiResult<QueryCancelData>>
}

export type TableAPI = {
  getStructure: (
    payload: TableGetStructurePayload,
  ) => Promise<ApiResult<TableGetStructureData>>
  getData: (payload: TableGetDataPayload) => Promise<ApiResult<TableGetDataData>>
  updateRow: (
    payload: TableUpdateRowPayload,
  ) => Promise<ApiResult<TableRowMutationData>>
  insertRow: (
    payload: TableInsertRowPayload,
  ) => Promise<ApiResult<TableRowMutationData>>
  deleteRow: (
    payload: TableDeleteRowPayload,
  ) => Promise<ApiResult<TableRowMutationData>>
}

export type AppLogAPI = {
  append: (payload: AppLogAppendPayload) => Promise<ApiResult<AppLogAppendData>>
}

export interface ElectronAPI {
  ping: () => Promise<string>
  platform: string
  appLog: AppLogAPI
  connections: ConnectionsAPI
  explorer: ExplorerAPI
  query: QueryAPI
  table: TableAPI
}

declare global {
  interface Window {
    /** 仅在 Electron 中由 preload 注入；纯浏览器调试用时可能不存在 */
    electronAPI?: ElectronAPI
  }
}

export {}
