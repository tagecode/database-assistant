import { ipcMain } from 'electron'
import { err, ok, type ApiResult } from '../../../shared/dto/api-result'
import type {
  TableDeleteRowPayload,
  TableGetDataData,
  TableGetDataPayload,
  TableGetStructureData,
  TableGetStructurePayload,
  TableInsertRowPayload,
  TableRowMutationData,
  TableUpdateRowPayload,
} from '../../../shared/dto/table'
import { getDatabaseAdapter } from '../db/adapterFactory'
import { getConnectionById } from '../services/connectionResolver'
import { IPC_CHANNELS } from '../../../shared/ipc/channels'
import { writeAppLog } from '../services/appLogger'

function wrapError(e: unknown, code: string): ApiResult<never> {
  writeAppLog({
    level: 'error',
    source: 'main',
    scope: `ipc.${code}`,
    message: e instanceof Error ? e.message : String(e),
    details: e,
  })
  if (e instanceof Error) {
    return err(code, e.message)
  }
  return err(code, String(e))
}

export function registerTableIpc() {
  ipcMain.handle(
    IPC_CHANNELS.TABLE_GET_STRUCTURE,
    async (_e, p: TableGetStructurePayload) => {
      try {
        const rec = await getConnectionById(p.connectionId)
        if (!rec) {
          return err('CONNECTION_NOT_FOUND', '未找到该连接')
        }
        const adapter = getDatabaseAdapter(rec)
        const data: TableGetStructureData = await adapter.getTableStructure(
          rec,
          p.table,
          p.kind,
          p.ref,
        )
        return ok(data)
      } catch (e) {
        return wrapError(e, 'TABLE_STRUCTURE_FAILED')
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.TABLE_GET_DATA, async (_e, p: TableGetDataPayload) => {
    try {
      const rec = await getConnectionById(p.connectionId)
      if (!rec) {
        return err('CONNECTION_NOT_FOUND', '未找到该连接')
      }
      const adapter = getDatabaseAdapter(rec)
      const page = Math.max(1, p.page)
      const pageSize = Math.min(1_000, Math.max(1, p.pageSize))
      const data: TableGetDataData = await adapter.getTableData(
        rec,
        p.table,
        p.kind,
        p.ref,
        page,
        pageSize,
      )
      return ok(data)
    } catch (e) {
      return wrapError(e, 'TABLE_DATA_FAILED')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.TABLE_UPDATE_ROW,
    async (_e, p: TableUpdateRowPayload) => {
      try {
        const rec = await getConnectionById(p.connectionId)
        if (!rec) {
          return err('CONNECTION_NOT_FOUND', '未找到该连接')
        }
        const adapter = getDatabaseAdapter(rec)
        const pks = await adapter.getPrimaryKeyColumnNames(rec, p.table, p.ref)
        const data: TableRowMutationData = await adapter.updateTableRow(
          rec,
          p.table,
          p.kind,
          p.ref,
          p.primaryKey,
          p.changes,
          pks,
        )
        return ok(data)
      } catch (e) {
        return wrapError(e, 'TABLE_UPDATE_FAILED')
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.TABLE_INSERT_ROW,
    async (_e, p: TableInsertRowPayload) => {
      try {
        const rec = await getConnectionById(p.connectionId)
        if (!rec) {
          return err('CONNECTION_NOT_FOUND', '未找到该连接')
        }
        const adapter = getDatabaseAdapter(rec)
        const data: TableRowMutationData = await adapter.insertTableRow(
          rec,
          p.table,
          p.kind,
          p.ref,
          p.row,
        )
        return ok(data)
      } catch (e) {
        return wrapError(e, 'TABLE_INSERT_FAILED')
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.TABLE_DELETE_ROW,
    async (_e, p: TableDeleteRowPayload) => {
      try {
        const rec = await getConnectionById(p.connectionId)
        if (!rec) {
          return err('CONNECTION_NOT_FOUND', '未找到该连接')
        }
        const adapter = getDatabaseAdapter(rec)
        const pks = await adapter.getPrimaryKeyColumnNames(rec, p.table, p.ref)
        const data: TableRowMutationData = await adapter.deleteTableRow(
          rec,
          p.table,
          p.kind,
          p.ref,
          p.primaryKey,
          pks,
        )
        return ok(data)
      } catch (e) {
        return wrapError(e, 'TABLE_DELETE_FAILED')
      }
    },
  )
}
