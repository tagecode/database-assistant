import { ipcMain } from 'electron'
import { err, ok } from '../../../shared/dto/api-result'
import type { AppLogAppendData, AppLogAppendPayload } from '../../../shared/dto/app-log'
import { IPC_CHANNELS } from '../../../shared/ipc/channels'
import { appendAppLog } from '../services/appLogger'

export function registerAppLogIpc() {
  ipcMain.handle(
    IPC_CHANNELS.APP_LOG_APPEND,
    async (_e, payload: AppLogAppendPayload) => {
      try {
        await appendAppLog(payload)
        return ok<AppLogAppendData>({ written: true })
      } catch (error) {
        return err(
          'APP_LOG_APPEND_FAILED',
          error instanceof Error ? error.message : String(error),
        )
      }
    },
  )
}
