import { ipcMain } from 'electron'
import { err, ok, type ApiResult } from '../../../shared/dto/api-result'
import type {
  ExplorerLoadChildrenData,
  ExplorerLoadChildrenPayload,
} from '../../../shared/dto/explorer'
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

export function registerExplorerIpc() {
  ipcMain.handle(
    IPC_CHANNELS.EXPLORER_LOAD_CHILDREN,
    async (_e, p: ExplorerLoadChildrenPayload) => {
      try {
        const rec = await getConnectionById(p.connectionId)
        if (!rec) {
          return err('CONNECTION_NOT_FOUND', '未找到该连接')
        }
        const adapter = getDatabaseAdapter(rec)
        const nodes = await adapter.loadExplorerChildren(rec, p.parentKey)
        const data: ExplorerLoadChildrenData = { nodes }
        return ok(data)
      } catch (e) {
        return wrapError(e, 'EXPLORER_LOAD_FAILED')
      }
    },
  )
}
