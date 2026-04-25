import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc/channels'
import { registerAppLogIpc } from './appLogIpc'
import { registerConnectionsIpc } from './connectionsIpc'
import { registerExplorerIpc } from './explorerIpc'
import { registerQueryIpc } from './queryIpc'
import { registerTableIpc } from './tableIpc'

export function registerIpcHandlers() {
  registerAppLogIpc()
  registerConnectionsIpc()
  registerExplorerIpc()
  registerQueryIpc()
  registerTableIpc()
  ipcMain.handle(IPC_CHANNELS.PING, () => 'pong')
}
