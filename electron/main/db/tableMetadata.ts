import {
  createConnection,
  type FieldPacket,
  type RowDataPacket,
} from 'mysql2/promise'
import { Client, type FieldDef } from 'pg'
import Database from 'better-sqlite3'
import type { ConnectionRecord } from '../../../shared/dto/connection'
import {
  type TableColumnInfo,
  type TableGetDataData,
  type TableGetStructureData,
  type TableRef,
} from '../../../shared/dto/table'
import type { QueryColumn } from '../../../shared/dto/query'
import { getConnectionPassword } from '../services/connectionPasswordStore'
import { cellValue, toRows } from './queryRun'

const IDENT = /^[a-zA-Z0-9_]+$/

export function assertIdent(s: string, name: string) {
  if (!IDENT.test(s)) {
    throw new Error(`非法的 ${name} 标识：${s}`)
  }
}

export function myQuoteDbTable(db: string, tb: string) {
  return `\`${db.replaceAll('`', '``')}\`.\`${tb.replaceAll('`', '``')}\``
}

export function pgQuoteSchemaTable(sch: string, tb: string) {
  return `"${sch.replaceAll('"', '""')}"."${tb.replaceAll('"', '""')}"`
}

export function slQuoteTable(tb: string) {
  return `"${tb.replaceAll('"', '""')}"`
}

export async function getTableStructure(
  record: ConnectionRecord,
  table: string,
  kind: 'table' | 'view',
  ref: TableRef | undefined,
): Promise<TableGetStructureData> {
  if (record.type === 'mysql') {
    return structureMysql(record, table, kind, ref)
  }
  if (record.type === 'postgres') {
    return structurePostgres(record, table, kind, ref)
  }
  if (record.type === 'sqlite') {
    return structureSqlite(record, table, kind)
  }
  throw new Error('不支持的连接类型')
}

export async function getTableData(
  record: ConnectionRecord,
  table: string,
  kind: 'table' | 'view',
  ref: TableRef | undefined,
  page: number,
  pageSize: number,
): Promise<TableGetDataData> {
  const t0 = Date.now()
  const p = Math.max(1, page)
  const ps = Math.min(1_000, Math.max(1, pageSize))
  const off = (p - 1) * ps

  if (record.type === 'mysql') {
    return dataMysql(record, table, ref, t0, p, ps, off)
  }
  if (record.type === 'postgres') {
    return dataPostgres(record, table, ref, t0, p, ps, off)
  }
  if (record.type === 'sqlite') {
    return dataSqlite(record, table, t0, p, ps, off)
  }
  throw new Error('不支持的连接类型')
}

/* ——— MySQL ——— */

async function structureMysql(
  record: ConnectionRecord,
  table: string,
  kind: 'table' | 'view',
  ref: TableRef | undefined,
): Promise<TableGetStructureData> {
  const db = ref?.database ?? record.database
  if (!db) {
    throw new Error('MySQL 需要 database（连接或 ref）')
  }
  assertIdent(db, 'database')
  assertIdent(table, 'table')
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
    const [rows] = await c.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA, COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [db, table],
    )
    const columns: TableColumnInfo[] = rows.map((r) => ({
      name: String(r['COLUMN_NAME']),
      dataType: String(r['COLUMN_TYPE'] ?? r['DATA_TYPE'] ?? ''),
      nullable: r['IS_NULLABLE'] === 'YES',
      defaultValue: r['COLUMN_DEFAULT'] == null ? null : String(r['COLUMN_DEFAULT']),
      key: r['COLUMN_KEY'] == null ? null : String(r['COLUMN_KEY']),
      extra: r['EXTRA'] == null ? null : String(r['EXTRA']),
    }))

    const [indexRows] = await c.query<RowDataPacket[]>(
      `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
       FROM information_schema.statistics
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [db, table],
    )
    const indexMap = new Map<
      string,
      { name: string; columns: string[]; unique: boolean }
    >()
    for (const row of indexRows) {
      const name = String(row['INDEX_NAME'] ?? '')
      if (!name) {
        continue
      }
      const item = indexMap.get(name) ?? {
        name,
        columns: [],
        unique: Number(row['NON_UNIQUE'] ?? 1) === 0,
      }
      item.columns.push(String(row['COLUMN_NAME'] ?? ''))
      indexMap.set(name, item)
    }
    const indexes = Array.from(indexMap.values())

    let ddl: string | null = null
    try {
      const full = myQuoteDbTable(db, table)
      const [dr] = await c.query<RowDataPacket[]>(
        kind === 'view' ? `SHOW CREATE VIEW ${full}` : `SHOW CREATE TABLE ${full}`,
      )
      if (Array.isArray(dr) && dr[0]) {
        const row0 = dr[0] as RowDataPacket
        const raw =
          (row0['Create Table'] as string | undefined) ??
          (row0['Create View'] as string | undefined)
        ddl = raw?.trim() ? raw : null
      }
    } catch {
      ddl = null
    }

    return { columns, indexes, ddl }
  } finally {
    await c.end()
  }
}

async function dataMysql(
  record: ConnectionRecord,
  table: string,
  ref: TableRef | undefined,
  t0: number,
  page: number,
  ps: number,
  off: number,
): Promise<TableGetDataData> {
  const db = ref?.database ?? record.database
  if (!db) {
    throw new Error('MySQL 需要 database（连接或 ref）')
  }
  assertIdent(db, 'database')
  assertIdent(table, 'table')
  const full = myQuoteDbTable(db, table)
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
    const [pkRows] = await c.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_KEY = 'PRI' ORDER BY ORDINAL_POSITION`,
      [db, table],
    )
    const primaryKeyColumnNames = (pkRows as RowDataPacket[]).map((r) =>
      String(r['COLUMN_NAME'] ?? ''),
    ).filter(Boolean)

    const [cntR] = await c.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM ${full} AS t`,
    )
    const total = Number((cntR[0] as RowDataPacket)?.c ?? 0)
    const [dataRows, fields] = await c.query<RowDataPacket[]>(
      `SELECT * FROM ${full} AS t LIMIT ? OFFSET ?`,
      [ps, off],
    )
    const f = fields as FieldPacket[] | undefined
    const cols: QueryColumn[] = (f ?? []).map((x) => ({
      name: x.name,
      dataType: x.columnType != null ? String(x.columnType) : null,
    }))
    const names = cols.map((x) => x.name)
    const rows = toRows(
      (Array.isArray(dataRows) ? dataRows : []) as unknown[],
      names,
    )
    return {
      columns: cols,
      rows,
      total,
      page,
      pageSize: ps,
      durationMs: Date.now() - t0,
      primaryKeyColumnNames,
    }
  } finally {
    await c.end()
  }
}

/* ——— PostgreSQL ——— */

async function structurePostgres(
  record: ConnectionRecord,
  table: string,
  kind: 'table' | 'view',
  ref: TableRef | undefined,
): Promise<TableGetStructureData> {
  const schema = ref?.schema
  if (!schema) {
    throw new Error('PostgreSQL 需要 ref.schema')
  }
  assertIdent(schema, 'schema')
  assertIdent(table, 'table')
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
    const { rows } = await cl.query<{
      column_name: string
      data_type: string
      is_nullable: string
      column_default: string | null
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table],
    )
    const columns: TableColumnInfo[] = rows.map((r) => ({
      name: r.column_name,
      dataType: r.data_type,
      nullable: r.is_nullable === 'YES',
      defaultValue: r.column_default,
      key: null,
      extra: null,
    }))

    const ir = await cl.query<{
      index_name: string
      column_name: string
      is_unique: boolean
      ordinal_position: number
    }>(
      `SELECT
         i.relname AS index_name,
         a.attname AS column_name,
         ix.indisunique AS is_unique,
         x.ordinality AS ordinal_position
       FROM pg_class t
       JOIN pg_namespace ns ON ns.oid = t.relnamespace
       JOIN pg_index ix ON ix.indrelid = t.oid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
       WHERE ns.nspname = $1
         AND t.relname = $2
       ORDER BY i.relname, x.ordinality`,
      [schema, table],
    )
    const indexMap = new Map<
      string,
      { name: string; columns: string[]; unique: boolean }
    >()
    for (const row of ir.rows) {
      const item = indexMap.get(row.index_name) ?? {
        name: row.index_name,
        columns: [],
        unique: row.is_unique,
      }
      item.columns.push(row.column_name)
      indexMap.set(row.index_name, item)
    }
    const indexes = Array.from(indexMap.values())

    let ddl: string | null = null
    if (kind === 'view') {
      const d = await cl.query<{ d: string }>(
        `SELECT view_definition as d
         FROM information_schema.views
         WHERE table_schema = $1 AND table_name = $2`,
        [schema, table],
      )
      ddl = d.rows[0]?.d?.trim() ?? null
    }

    return { columns, indexes, ddl }
  } finally {
    await cl.end()
  }
}

async function dataPostgres(
  record: ConnectionRecord,
  table: string,
  ref: TableRef | undefined,
  t0: number,
  page: number,
  ps: number,
  off: number,
): Promise<TableGetDataData> {
  const schema = ref?.schema
  if (!schema) {
    throw new Error('PostgreSQL 需要 ref.schema')
  }
  assertIdent(schema, 'schema')
  assertIdent(table, 'table')
  const full = pgQuoteSchemaTable(schema, table)
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
    const pkr = await cl.query<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
         AND tc.constraint_name = kcu.constraint_name
       WHERE tc.table_schema = $1
         AND tc.table_name = $2
         AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY kcu.ordinal_position`,
      [schema, table],
    )
    const primaryKeyColumnNames = pkr.rows.map((r) => r.column_name).filter(Boolean)

    const cr = await cl.query<{ c: string }>(
      `SELECT COUNT(*)::bigint::text AS c FROM ${full} AS t`,
    )
    const total = parseInt(String(cr.rows[0]?.c ?? '0'), 10) || 0
    const r = await cl.query(`SELECT * FROM ${full} AS t LIMIT $1 OFFSET $2`, [
      ps,
      off,
    ])
    const raw = r.rows as Record<string, unknown>[]
    const f = r.fields as FieldDef[] | undefined
    const cols: QueryColumn[] = (f ?? []).map((x) => ({
      name: x.name,
      dataType: x.dataTypeID != null ? String(x.dataTypeID) : null,
    }))
    const rows = raw.map((row) => {
      const o: Record<string, unknown> = {}
      for (const k of Object.keys(row)) {
        o[k] = cellValue(row[k])
      }
      return o
    })
    return {
      columns: cols,
      rows,
      total,
      page,
      pageSize: ps,
      durationMs: Date.now() - t0,
      primaryKeyColumnNames,
    }
  } finally {
    await cl.end()
  }
}

/* ——— SQLite ——— */

function structureSqlite(
  record: ConnectionRecord,
  table: string,
  _kind: 'table' | 'view',
): TableGetStructureData {
  void _kind
  const p = record.filePath
  if (!p) {
    throw new Error('缺少 SQLite 文件路径')
  }
  assertIdent(table, 'table')
  const db = new Database(p, { fileMustExist: true, timeout: 5_000 })
  try {
    const q = `"${table.replaceAll('"', '""')}"`
    const info = db.prepare(`PRAGMA table_info(${q})`).all() as Array<{
      cid: number
      name: string
      type: string
      notnull: number
      dflt_value: string | null
      pk: number
    }>
    if (info.length === 0) {
      throw new Error('未找到表或视图信息')
    }
    const columns: TableColumnInfo[] = info.map((row) => ({
      name: row.name,
      dataType: row.type,
      nullable: row.notnull === 0,
      defaultValue: row.dflt_value,
      key: row.pk > 0 ? 'PRI' : null,
      extra: null,
    }))

    const il = db.prepare(`PRAGMA index_list(${q})`).all() as Array<{
      name: string
      unique: number
      origin?: string
    }>
    const indexes = il.map((item) => {
      const cols = db.prepare(`PRAGMA index_info("${item.name.replaceAll('"', '""')}")`).all() as Array<{
        name: string
      }>
      return {
        name: item.name,
        unique: item.unique === 1,
        columns: cols.map((c) => c.name),
      }
    })

    const row = db
      .prepare(`SELECT sql FROM sqlite_master WHERE name = ? AND (type = 'table' OR type = 'view')`)
      .get(table) as { sql: string } | undefined
    const ddl = row?.sql?.trim() ?? null

    return { columns, indexes, ddl }
  } finally {
    db.close()
  }
}

function dataSqlite(
  record: ConnectionRecord,
  table: string,
  t0: number,
  page: number,
  ps: number,
  off: number,
): TableGetDataData {
  const p = record.filePath
  if (!p) {
    throw new Error('缺少 SQLite 文件路径')
  }
  assertIdent(table, 'table')
  const full = slQuoteTable(table)
  const db = new Database(p, { fileMustExist: true, timeout: 5_000 })
  try {
    const qn = `"${table.replaceAll('"', '""')}"`
    const tinfo = db.prepare(`PRAGMA table_info(${qn})`).all() as Array<{
      name: string
      pk: number
    }>
    const primaryKeyColumnNames = tinfo
      .filter((r) => r.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((r) => r.name)

    const cRow = db.prepare(`SELECT COUNT(*) as c FROM ${full} AS t`).get() as {
      c: number
    }
    const total = Number(cRow.c) || 0
    const st = db.prepare(
      `SELECT * FROM ${full} AS t LIMIT ? OFFSET ?`,
    )
    const all = st.all(ps, off) as Record<string, unknown>[]
    if (all.length === 0) {
      return {
        columns: [],
        rows: [],
        total,
        page,
        pageSize: ps,
        durationMs: Date.now() - t0,
        primaryKeyColumnNames,
      }
    }
    const keys = Object.keys(all[0] ?? {})
    const columns: QueryColumn[] = keys.map((k) => ({ name: k, dataType: null }))
    const rows = toRows(all as unknown[], keys)
    return {
      columns,
      rows,
      total,
      page,
      pageSize: ps,
      durationMs: Date.now() - t0,
      primaryKeyColumnNames,
    }
  } finally {
    db.close()
  }
}

/**
 * 用于行级 DML 前从库中解析主键列（与分页查询中的规则一致）
 */
export async function getPrimaryKeyColumnNames(
  record: ConnectionRecord,
  table: string,
  ref: TableRef | undefined,
): Promise<string[]> {
  if (record.type === 'mysql') {
    const db = ref?.database ?? record.database
    if (!db) {
      throw new Error('MySQL 需要 database（连接或 ref）')
    }
    assertIdent(db, 'database')
    assertIdent(table, 'table')
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
      const [pkRows] = await c.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_KEY = 'PRI' ORDER BY ORDINAL_POSITION`,
        [db, table],
      )
      return (pkRows as RowDataPacket[]).map((r) => String(r['COLUMN_NAME'] ?? '')).filter(Boolean)
    } finally {
      await c.end()
    }
  }
  if (record.type === 'postgres') {
    const schema = ref?.schema
    if (!schema) {
      throw new Error('PostgreSQL 需要 ref.schema')
    }
    assertIdent(schema, 'schema')
    assertIdent(table, 'table')
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
      const pkr = await cl.query<{ column_name: string }>(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.table_schema = kcu.table_schema
           AND tc.table_name = kcu.table_name
           AND tc.constraint_name = kcu.constraint_name
         WHERE tc.table_schema = $1
           AND tc.table_name = $2
           AND tc.constraint_type = 'PRIMARY KEY'
         ORDER BY kcu.ordinal_position`,
        [schema, table],
      )
      return pkr.rows.map((r) => r.column_name).filter(Boolean)
    } finally {
      await cl.end()
    }
  }
  if (record.type === 'sqlite') {
    const p = record.filePath
    if (!p) {
      throw new Error('缺少 SQLite 文件路径')
    }
    assertIdent(table, 'table')
    const db = new Database(p, { fileMustExist: true, timeout: 5_000 })
    try {
      const qn = `"${table.replaceAll('"', '""')}"`
      const tinfo = db.prepare(`PRAGMA table_info(${qn})`).all() as Array<{
        name: string
        pk: number
      }>
      return tinfo
        .filter((r) => r.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((r) => r.name)
    } finally {
      db.close()
    }
  }
  throw new Error('不支持的连接类型')
}
