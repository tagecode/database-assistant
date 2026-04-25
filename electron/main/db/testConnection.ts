import type { ConnectionFormFields } from '../../../shared/dto/connection'
import { getConnectionPassword } from '../services/connectionPasswordStore'
import { getDatabaseAdapterByKind } from './adapterFactory'

function parsePort(raw: string, fallback: number) {
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function fieldsToTestPayload(
  f: ConnectionFormFields,
  password: string,
): {
  type: ConnectionFormFields['type']
  host?: string
  port?: number
  user?: string
  database?: string
  filePath?: string
  password: string
} {
  return {
    type: f.type,
    host: f.host || undefined,
    port:
      f.type === 'mysql'
        ? parsePort(f.port, 3306)
        : f.type === 'postgres'
          ? parsePort(f.port, 5432)
          : undefined,
    user: f.user || undefined,
    database: f.database || undefined,
    filePath: f.filePath || undefined,
    password,
  }
}

export async function testFromFormFields(
  f: ConnectionFormFields,
  password: string,
) {
  await testWithResolved(fieldsToTestPayload(f, password))
}

export async function testSavedConnection(
  id: string,
  record: { type: string; host?: string; port?: number; user?: string; database?: string; filePath?: string },
) {
  const pw = (await getConnectionPassword(id)) ?? ''
  await testWithResolved({
    type: record.type as ConnectionFormFields['type'],
    host: record.host,
    port: record.port,
    user: record.user,
    database: record.database,
    filePath: record.filePath,
    password: pw,
  })
}

async function testWithResolved(p: {
  type: ConnectionFormFields['type']
  host?: string
  port?: number
  user?: string
  database?: string
  filePath?: string
  password: string
}) {
  const adapter = getDatabaseAdapterByKind(p.type)
  await adapter.testConnection(p)
}
