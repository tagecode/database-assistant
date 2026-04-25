import { readFile, writeFile } from 'node:fs/promises'
import type { ConnectionRecord } from '../../../shared/dto/connection'
import { getConnectionsFilePath } from './paths'

type FileShape = { version: 1; items: ConnectionRecord[] }

function normalizeRecord(
  input: Partial<ConnectionRecord>,
): ConnectionRecord | null {
  if (!input.id || !input.name || !input.type || !input.createdAt || !input.updatedAt) {
    return null
  }
  return {
    id: input.id,
    name: input.name,
    type: input.type,
    favorite: input.favorite ?? false,
    group:
      input.group != null && String(input.group).trim()
        ? String(input.group).trim()
        : null,
    host: input.host,
    port: input.port,
    user: input.user,
    database: input.database,
    filePath: input.filePath,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

export async function readConnectionsFile(): Promise<ConnectionRecord[]> {
  const p = getConnectionsFilePath()
  try {
    const raw = await readFile(p, 'utf8')
    const parsed = JSON.parse(raw) as FileShape
    if (!Array.isArray(parsed?.items)) {
      return []
    }
    return parsed.items
      .map((item) => normalizeRecord(item))
      .filter((item): item is ConnectionRecord => item != null)
  } catch {
    return []
  }
}

export async function writeConnectionsFile(
  items: ConnectionRecord[],
): Promise<void> {
  const p = getConnectionsFilePath()
  const data: FileShape = { version: 1, items }
  await writeFile(p, JSON.stringify(data, null, 2), 'utf8')
}
