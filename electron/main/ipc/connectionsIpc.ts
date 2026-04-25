import { randomUUID } from 'node:crypto'
import { dialog, ipcMain } from 'electron'
import { err, ok, type ApiResult } from '../../../shared/dto/api-result'
import type {
  ConnectionCreatePayload,
  ConnectionDeletePayload,
  ConnectionFormFields,
  ConnectionRecord,
  ConnectionTestPayload,
  ConnectionUpdatePayload,
} from '../../../shared/dto/connection'
import { testFromFormFields, testSavedConnection } from '../db/testConnection'
import {
  readConnectionsFile,
  writeConnectionsFile,
} from '../services/connectionsFile'
import {
  removeConnectionPassword,
  setConnectionPasswordAsync,
} from '../services/connectionPasswordStore'
import { IPC_CHANNELS } from '../../../shared/ipc/channels'
import { writeAppLog } from '../services/appLogger'

function parsePort(raw: string, fallback: number) {
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function validateFields(f: ConnectionFormFields) {
  if (!f.name.trim()) {
    throw new Error('请填写连接名称')
  }
  if (f.type === 'sqlite') {
    if (!f.filePath.trim()) {
      throw new Error('请填写 SQLite 文件路径')
    }
    return
  }
  if (!f.host.trim()) {
    throw new Error('请填写主机')
  }
}

function toRecord(
  id: string,
  f: ConnectionFormFields,
  prev?: ConnectionRecord,
): ConnectionRecord {
  const now = new Date().toISOString()
  return {
    id,
    name: f.name.trim(),
    type: f.type,
    favorite: !!f.favorite,
    group: f.group.trim() || null,
    host: f.type === 'sqlite' ? undefined : f.host.trim() || undefined,
    port:
      f.type === 'mysql'
        ? parsePort(f.port, 3306)
        : f.type === 'postgres'
          ? parsePort(f.port, 5432)
          : undefined,
    user: f.type === 'sqlite' ? undefined : f.user.trim() || undefined,
    database: f.type === 'sqlite' ? undefined : f.database.trim() || undefined,
    filePath: f.type === 'sqlite' ? f.filePath.trim() : undefined,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  }
}

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

export function registerConnectionsIpc() {
  ipcMain.handle(IPC_CHANNELS.CONNECTION_LIST, async () => {
    try {
      const items = await readConnectionsFile()
      return ok({ connections: items })
    } catch (e) {
      return wrapError(e, 'CONNECTION_LIST_FAILED')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.CONNECTION_CREATE,
    async (_e, p: ConnectionCreatePayload) => {
      try {
        validateFields(p.fields)
        const id = randomUUID()
        const record = toRecord(id, p.fields)
        const all = await readConnectionsFile()
        if (all.some((x) => x.name === record.name)) {
          return err('CONNECTION_DUPLICATE_NAME', '已存在同名连接')
        }
        all.push(record)
        await writeConnectionsFile(all)
        await setConnectionPasswordAsync(id, p.fields.password || '')
        return ok({ connection: record })
      } catch (e) {
        return wrapError(e, 'CONNECTION_CREATE_FAILED')
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CONNECTION_UPDATE,
    async (_e, p: ConnectionUpdatePayload) => {
      try {
        validateFields(p.fields)
        const all = await readConnectionsFile()
        const i = all.findIndex((x) => x.id === p.id)
        if (i === -1) {
          return err('CONNECTION_NOT_FOUND', '未找到该连接')
        }
        if (all.some((x) => x.name === p.fields.name.trim() && x.id !== p.id)) {
          return err('CONNECTION_DUPLICATE_NAME', '已存在同名连接')
        }
        const prev = all[i]!
        const next = toRecord(p.id, p.fields, prev)
        all[i] = next
        await writeConnectionsFile(all)
        if (p.fields.password !== undefined && p.fields.password !== '') {
          await setConnectionPasswordAsync(p.id, p.fields.password)
        }
        return ok({ connection: next })
      } catch (e) {
        return wrapError(e, 'CONNECTION_UPDATE_FAILED')
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.CONNECTION_DELETE,
    async (_e, p: ConnectionDeletePayload) => {
      try {
        const all = await readConnectionsFile()
        const next = all.filter((x) => x.id !== p.id)
        if (next.length === all.length) {
          return err('CONNECTION_NOT_FOUND', '未找到该连接')
        }
        await writeConnectionsFile(next)
        await removeConnectionPassword(p.id)
        return ok(undefined)
      } catch (e) {
        return wrapError(e, 'CONNECTION_DELETE_FAILED')
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.CONNECTION_TEST, async (_e, p: ConnectionTestPayload) => {
    try {
      if (p.kind === 'draft') {
        validateFields(p.fields)
        await testFromFormFields(p.fields, p.fields.password)
        return ok({ ok: true as const })
      }
      const all = await readConnectionsFile()
      const r = all.find((x) => x.id === p.id)
      if (!r) {
        return err('CONNECTION_NOT_FOUND', '未找到该连接')
      }
      await testSavedConnection(r.id, r)
      return ok({ ok: true as const })
    } catch (e) {
      return wrapError(e, 'CONNECTION_TEST_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_PICK_SQLITE, async () => {
    const r = await dialog.showOpenDialog({
      title: '选择 SQLite 数据库文件',
      properties: ['openFile'],
      filters: [
        { name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    if (r.canceled || !r.filePaths[0]) {
      return ok(null)
    }
    return ok({ path: r.filePaths[0]! })
  })
}
