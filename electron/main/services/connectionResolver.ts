import type { ConnectionRecord } from '../../../shared/dto/connection'
import { readConnectionsFile } from './connectionsFile'

export async function getConnectionById(
  id: string,
): Promise<ConnectionRecord | null> {
  const all = await readConnectionsFile()
  return all.find((c) => c.id === id) ?? null
}
