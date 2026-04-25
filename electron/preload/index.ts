import { contextBridge, ipcRenderer } from 'electron'
import type { ApiResult } from '../../shared/dto/api-result'
import type { AppLogAppendData, AppLogAppendPayload } from '../../shared/dto/app-log'
import type {
  ConnectionCreatePayload,
  ConnectionDeletePayload,
  ConnectionListPayload,
  ConnectionRecord,
  ConnectionTestPayload,
  ConnectionUpdatePayload,
} from '../../shared/dto/connection'
import type {
  ExplorerLoadChildrenData,
  ExplorerLoadChildrenPayload,
} from '../../shared/dto/explorer'
import type {
  QueryCancelData,
  QueryCancelPayload,
  QueryExecuteData,
  QueryExecuteResult,
  QueryExecutePayload,
  QueryFetchPagePayload,
} from '../../shared/dto/query'
import type {
  TableDeleteRowPayload,
  TableGetDataData,
  TableGetDataPayload,
  TableGetStructureData,
  TableGetStructurePayload,
  TableInsertRowPayload,
  TableRowMutationData,
  TableUpdateRowPayload,
} from '../../shared/dto/table'
import { IPC_CHANNELS } from '../../shared/ipc/channels'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.PING) as Promise<string>,
  platform: process.platform,
  appLog: {
    append: (payload: AppLogAppendPayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.APP_LOG_APPEND,
        payload,
      ) as Promise<ApiResult<AppLogAppendData>>,
  },

  connections: {
    list: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CONNECTION_LIST,
      ) as Promise<ApiResult<ConnectionListPayload>>,
    create: (payload: ConnectionCreatePayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CONNECTION_CREATE,
        payload,
      ) as Promise<ApiResult<{ connection: ConnectionRecord }>>,
    update: (payload: ConnectionUpdatePayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CONNECTION_UPDATE,
        payload,
      ) as Promise<ApiResult<{ connection: ConnectionRecord }>>,
    remove: (payload: ConnectionDeletePayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CONNECTION_DELETE,
        payload,
      ) as Promise<ApiResult<void>>,
    test: (payload: ConnectionTestPayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CONNECTION_TEST,
        payload,
      ) as Promise<ApiResult<{ ok: true }>>,
    pickSqliteFile: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.DIALOG_PICK_SQLITE,
      ) as Promise<ApiResult<{ path: string } | null>>,
  },

  explorer: {
    loadChildren: (payload: ExplorerLoadChildrenPayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.EXPLORER_LOAD_CHILDREN,
        payload,
      ) as Promise<ApiResult<ExplorerLoadChildrenData>>,
  },

  query: {
    execute: (payload: QueryExecutePayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.QUERY_EXECUTE,
        payload,
      ) as Promise<ApiResult<QueryExecuteResult>>,
    fetchPage: (payload: QueryFetchPagePayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.QUERY_FETCH_PAGE,
        payload,
      ) as Promise<ApiResult<QueryExecuteData>>,
    cancel: (payload: QueryCancelPayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.QUERY_CANCEL,
        payload,
      ) as Promise<ApiResult<QueryCancelData>>,
  },

  table: {
    getStructure: (payload: TableGetStructurePayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.TABLE_GET_STRUCTURE,
        payload,
      ) as Promise<ApiResult<TableGetStructureData>>,
    getData: (payload: TableGetDataPayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.TABLE_GET_DATA,
        payload,
      ) as Promise<ApiResult<TableGetDataData>>,
    updateRow: (payload: TableUpdateRowPayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.TABLE_UPDATE_ROW,
        payload,
      ) as Promise<ApiResult<TableRowMutationData>>,
    insertRow: (payload: TableInsertRowPayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.TABLE_INSERT_ROW,
        payload,
      ) as Promise<ApiResult<TableRowMutationData>>,
    deleteRow: (payload: TableDeleteRowPayload) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.TABLE_DELETE_ROW,
        payload,
      ) as Promise<ApiResult<TableRowMutationData>>,
  },
})
