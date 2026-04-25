import { createConnection, type RowDataPacket } from 'mysql2/promise'
import { Client } from 'pg'
import Database from 'better-sqlite3'
import type { ConnectionRecord } from '../../../shared/dto/connection'
import type { ExplorerNodeDto } from '../../../shared/dto/explorer'
import { getConnectionPassword } from '../services/connectionPasswordStore'
import { b64d, b64e } from './encodePath'

const MYSQL_DB = (name: string) => `m/d/${b64e(name)}`
const MYSQL_T = (db: string, table: string) => `m/t/${b64e(db)}/${b64e(table)}`
const PG_SCH = (s: string) => `p/s/${b64e(s)}`
const PG_T = (sch: string, t: string) => `p/t/${b64e(sch)}/${b64e(t)}`
const SQLITE_T = (name: string) => `s/t/${b64e(name)}`

function mapTableKind(
  t: string,
): 'table' | 'view' {
  return t === 'VIEW' || t === 'SYSTEM VIEW' ? 'view' : 'table'
}

export async function loadExplorerChildren(
  record: ConnectionRecord,
  parentKey: string | null,
): Promise<ExplorerNodeDto[]> {
  const type = record.type
  if (type === 'mysql') {
    return loadMysqlChildren(record, parentKey)
  }
  if (type === 'postgres') {
    return loadPostgresChildren(record, parentKey)
  }
  if (type === 'sqlite') {
    return loadSqliteChildren(record, parentKey)
  }
  return []
}

async function loadMysqlChildren(
  record: ConnectionRecord,
  parentKey: string | null,
): Promise<ExplorerNodeDto[]> {
  const pw = (await getConnectionPassword(record.id)) ?? ''
  const c = await createConnection({
    host: record.host,
    port: record.port ?? 3306,
    user: record.user,
    password: pw,
    database: record.database,
    connectTimeout: 8_000,
  })
  try {
    if (parentKey === null) {
      const [dbs] = await c.query<RowDataPacket[]>('SHOW DATABASES')
      return dbs.map((row) => {
        const name = String(row['Database'] ?? (row as { database?: string }).database ?? '')
        return {
          id: MYSQL_DB(name),
          label: name,
          kind: 'database' as const,
          hasChildren: true,
        }
      })
    }
    if (parentKey.startsWith('m/d/')) {
      const name = b64d(parentKey.slice(4))
      const [rows] = await c.query<RowDataPacket[]>(
        `SELECT TABLE_NAME, TABLE_TYPE
         FROM information_schema.tables
         WHERE table_schema = ?
         ORDER BY TABLE_NAME`,
        [name],
      )
      return rows.map((row) => {
        const tname = String(row['TABLE_NAME'])
        const ttype = String(row['TABLE_TYPE'] ?? 'BASE TABLE')
        const k = mapTableKind(ttype)
        return {
          id: MYSQL_T(name, tname),
          label: tname,
          kind: k,
          hasChildren: false,
          ref: { database: name },
        }
      })
    }
    return []
  } finally {
    await c.end()
  }
}

async function loadPostgresChildren(
  record: ConnectionRecord,
  parentKey: string | null,
): Promise<ExplorerNodeDto[]> {
  const pw = (await getConnectionPassword(record.id)) ?? ''
  const cl = new Client({
    host: record.host,
    port: record.port ?? 5432,
    user: record.user,
    password: pw,
    database: record.database || 'postgres',
    connectionTimeoutMillis: 8_000,
  })
  await cl.connect()
  try {
    if (parentKey === null) {
      const { rows } = await cl.query<{
        schema_name: string
      }>(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          AND schema_name !~ '^pg_'
        ORDER BY schema_name
      `)
      return rows.map((r) => {
        const s = r.schema_name
        return {
          id: PG_SCH(s),
          label: s,
          kind: 'schema' as const,
          hasChildren: true,
        }
      })
    }
    if (parentKey.startsWith('p/s/')) {
      const schema = b64d(parentKey.slice(4))
      const { rows } = await cl.query<{
        table_name: string
        table_type: string
      }>(
        `SELECT table_name, table_type
         FROM information_schema.tables
         WHERE table_schema = $1
         ORDER BY table_name`,
        [schema],
      )
      return rows.map((r) => {
        const tname = r.table_name
        const k = mapTableKind(r.table_type)
        return {
          id: PG_T(schema, tname),
          label: tname,
          kind: k,
          hasChildren: false,
          ref: { schema },
        }
      })
    }
    return []
  } finally {
    await cl.end()
  }
}

function loadSqliteChildren(
  record: ConnectionRecord,
  parentKey: string | null,
): ExplorerNodeDto[] {
  if (parentKey !== null) {
    return []
  }
  const p = record.filePath
  if (!p) {
    return []
  }
  const db = new Database(p, { fileMustExist: true, timeout: 5_000 })
  try {
    const rows = db
      .prepare<[], { name: string; type: string }>(`
        SELECT name, type FROM sqlite_master
        WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `)
      .all()
    return rows.map((r) => {
      const k = r.type === 'view' ? 'view' : 'table'
      return {
        id: SQLITE_T(r.name),
        label: r.name,
        kind: k,
        hasChildren: false,
      }
    })
  } finally {
    db.close()
  }
}
