import { Buffer } from 'node:buffer'
import { createConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'
import { Client, type FieldDef } from 'pg'
import Database from 'better-sqlite3'
import type { ConnectionRecord } from '../../../shared/dto/connection'
import type {
  QueryColumn,
  QueryContext,
  QueryExecuteData,
  QueryExecuteResult,
  QueryResultSet,
} from '../../../shared/dto/query'
import { getConnectionPassword } from '../services/connectionPasswordStore'
import {
  registerQueryRun,
  unregisterQueryRun,
} from '../services/queryRunRegistry'
import { splitSqlStatements } from './splitSqlStatements'

export class QueryCancelledError extends Error {
  constructor() {
    super('QUERY_CANCELLED')
    this.name = 'QueryCancelledError'
  }
}

export function cellValue(v: unknown): unknown {
  if (v == null) {
    return v
  }
  if (typeof v === 'bigint') {
    return v.toString()
  }
  if (v instanceof Date) {
    return v.toISOString()
  }
  if (Buffer.isBuffer(v)) {
    return v.toString('base64')
  }
  if (Array.isArray(v)) {
    return v.map(cellValue)
  }
  if (typeof v === 'object') {
    if (v instanceof Object && 'toString' in v) {
      try {
        return String((v as { toString: () => string }).toString())
      } catch {
        // ignore
      }
    }
  }
  return v
}

export function toRows(
  raw: unknown[],
  columnNames: string[],
): Record<string, unknown>[] {
  return raw.map((row) => {
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
      const o: Record<string, unknown> = {}
      for (const k of Object.keys(row as object)) {
        o[k] = cellValue((row as Record<string, unknown>)[k])
      }
      return o
    }
    const o: Record<string, unknown> = {}
    for (let i = 0; i < columnNames.length; i++) {
      o[columnNames[i] ?? `col${i}`] = cellValue(
        Array.isArray(row) ? (row as unknown[])[i] : row,
      )
    }
    return o
  })
}

function stripLeadingSqlComments(input: string): string {
  let sql = input.trimStart()
  while (sql.length > 0) {
    if (sql.startsWith('--')) {
      const idx = sql.indexOf('\n')
      sql = idx >= 0 ? sql.slice(idx + 1).trimStart() : ''
      continue
    }
    if (sql.startsWith('#')) {
      const idx = sql.indexOf('\n')
      sql = idx >= 0 ? sql.slice(idx + 1).trimStart() : ''
      continue
    }
    if (sql.startsWith('/*')) {
      const idx = sql.indexOf('*/')
      sql = idx >= 0 ? sql.slice(idx + 2).trimStart() : ''
      continue
    }
    break
  }
  return sql
}

function supportsWrappedPagination(sql: string): boolean {
  const lead = stripLeadingSqlComments(sql).toLowerCase()
  return lead.startsWith('select ') || lead.startsWith('with ')
}

function cleanIdentifier(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

function quotePgIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function pageMeta(totalRows: number, page: number, pageSize: number) {
  const safePage = Math.max(1, page)
  const safePageSize = Math.max(1, pageSize)
  const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize))
  return {
    page: Math.min(safePage, totalPages),
    pageSize: safePageSize,
    totalRows,
    totalPages,
  }
}

function makeQueryData(input: {
  columns: QueryColumn[]
  rows: Record<string, unknown>[]
  totalRows: number
  page: number
  pageSize: number
  durationMs: number
  paginatable: boolean
  truncated: boolean
}): QueryExecuteData {
  const meta = pageMeta(input.totalRows, input.page, input.pageSize)
  return {
    columns: input.columns,
    rows: input.rows,
    page: meta.page,
    pageSize: meta.pageSize,
    totalRows: meta.totalRows,
    totalPages: meta.totalPages,
    paginatable: input.paginatable,
    rowCount: meta.totalRows,
    durationMs: input.durationMs,
    truncated: input.truncated,
  }
}

export async function runSqlQuery(
  record: ConnectionRecord,
  sql: string,
  pageSize: number,
  queryRunId?: string,
  queryContext?: QueryContext,
): Promise<QueryExecuteResult> {
  const statements = splitSqlStatements(sql)
  if (statements.length === 0) {
    throw new Error('SQL 为空')
  }
  const t0 = Date.now()
  const results: QueryResultSet[] = []
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i]!
    const data = await fetchSqlQueryPage(
      record,
      stmt,
      1,
      pageSize,
      queryRunId,
      queryContext,
    )
    results.push({
      id: `${i}-${Buffer.from(stmt).toString('base64').slice(0, 16)}`,
      statementIndex: i,
      sql: stmt,
      queryContext,
      ...data,
    })
  }
  return {
    results,
    totalDurationMs: Date.now() - t0,
  }
}

export async function fetchSqlQueryPage(
  record: ConnectionRecord,
  sql: string,
  page: number,
  pageSize: number,
  queryRunId?: string,
  queryContext?: QueryContext,
): Promise<QueryExecuteData> {
  const type = record.type
  if (type === 'mysql') {
    return runMysql(record, sql, page, pageSize, Date.now(), queryRunId, queryContext)
  }
  if (type === 'postgres') {
    return runPostgres(record, sql, page, pageSize, Date.now(), queryRunId, queryContext)
  }
  if (type === 'sqlite') {
    return Promise.resolve(runSqlite(record, sql, page, pageSize, Date.now()))
  }
  throw new Error('不支持的连接类型')
}

async function runMysql(
  record: ConnectionRecord,
  sql: string,
  page: number,
  pageSize: number,
  t0: number,
  queryRunId?: string,
  queryContext?: QueryContext,
): Promise<QueryExecuteData> {
  const pw = (await getConnectionPassword(record.id)) ?? ''
  const database = cleanIdentifier(queryContext?.database) ?? record.database
  const c = await createConnection({
    host: record.host,
    port: record.port ?? 3306,
    user: record.user,
    password: pw,
    database,
    connectTimeout: 8_000,
  })
  let cancelled = false
  if (queryRunId) {
    registerQueryRun(queryRunId, () => {
      cancelled = true
      c.destroy()
    })
  }
  try {
    if (supportsWrappedPagination(sql)) {
      const off = (Math.max(1, page) - 1) * Math.max(1, pageSize)
      const [countRows] = await c.query<Array<RowDataPacket & { c: number }>>(
        `SELECT COUNT(*) AS c FROM (${sql}) AS _biu_page_count`,
      )
      const totalRows = Number(countRows[0]?.c ?? 0)
      const [rows, fields] = await c.query(
        `SELECT * FROM (${sql}) AS _biu_page_rows LIMIT ? OFFSET ?`,
        [pageSize, off],
      )
      const cols: QueryColumn[] = (Array.isArray(fields) ? fields : []).map((f) => ({
        name: f.name,
        dataType: f.columnType != null ? String(f.columnType) : null,
      }))
      const pageRows = Array.isArray(rows) ? (rows as unknown[]) : []
      return makeQueryData({
        columns: cols,
        rows: toRows(pageRows, cols.map((x) => x.name)),
        totalRows,
        page,
        pageSize,
        durationMs: Date.now() - t0,
        paginatable: true,
        truncated: false,
      })
    }

    const [rows, fields] = await c.query(sql)
    if (!Array.isArray(rows)) {
      const h = rows as ResultSetHeader
      return makeQueryData({
        columns: [],
        rows: [],
        totalRows: h.affectedRows,
        page: 1,
        pageSize,
        durationMs: Date.now() - t0,
        paginatable: false,
        truncated: false,
      })
    }
    const cols: QueryColumn[] = (Array.isArray(fields) ? fields : []).map(
      (f) => ({
        name: f.name,
        dataType: f.columnType != null ? String(f.columnType) : null,
      }),
    )
    const limited = (rows as unknown[]).slice(0, pageSize)
    const names = cols.map((x) => x.name)
    return makeQueryData({
      columns: cols,
      rows: toRows(limited, names),
      totalRows: (rows as unknown[]).length,
      page: 1,
      pageSize,
      durationMs: Date.now() - t0,
      paginatable: false,
      truncated: (rows as unknown[]).length > pageSize,
    })
  } catch (e) {
    if (cancelled) {
      throw new QueryCancelledError()
    }
    throw e
  } finally {
    if (queryRunId) {
      unregisterQueryRun(queryRunId)
    }
    if (!cancelled) {
      await c.end().catch(() => {})
    }
  }
}

async function runPostgres(
  record: ConnectionRecord,
  sql: string,
  page: number,
  pageSize: number,
  t0: number,
  queryRunId?: string,
  queryContext?: QueryContext,
): Promise<QueryExecuteData> {
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
  const schema = cleanIdentifier(queryContext?.schema)
  if (schema) {
    await cl.query(`SET search_path TO ${quotePgIdentifier(schema)}, public`)
  }
  let cancelled = false
  if (queryRunId) {
    registerQueryRun(queryRunId, () => {
      cancelled = true
      cl.end().catch(() => {})
    })
  }
  try {
    if (supportsWrappedPagination(sql)) {
      const off = (Math.max(1, page) - 1) * Math.max(1, pageSize)
      const countRes = await cl.query<{ c: string }>(
        `SELECT COUNT(*)::bigint::text AS c FROM (${sql}) AS _biu_page_count`,
      )
      const totalRows = parseInt(String(countRes.rows[0]?.c ?? '0'), 10) || 0
      const pageRes = await cl.query(
        `SELECT * FROM (${sql}) AS _biu_page_rows LIMIT $1 OFFSET $2`,
        [pageSize, off],
      )
      const f = pageRes.fields as FieldDef[] | undefined
      const cols: QueryColumn[] = (f ?? []).map((x) => ({
        name: x.name,
        dataType: x.dataTypeID != null ? String(x.dataTypeID) : null,
      }))
      return makeQueryData({
        columns: cols,
        rows: (pageRes.rows as Record<string, unknown>[]).map((row) => {
          const o: Record<string, unknown> = {}
          for (const k of Object.keys(row)) {
            o[k] = cellValue(row[k])
          }
          return o
        }),
        totalRows,
        page,
        pageSize,
        durationMs: Date.now() - t0,
        paginatable: true,
        truncated: false,
      })
    }

    const r = await cl.query(sql)
    if (r.command && r.command !== 'SELECT' && r.rowCount != null) {
      return makeQueryData({
        columns: [],
        rows: [],
        totalRows: r.rowCount,
        page: 1,
        pageSize,
        durationMs: Date.now() - t0,
        paginatable: false,
        truncated: false,
      })
    }
    const rawRows = r.rows as Record<string, unknown>[]
    const f = r.fields as FieldDef[] | undefined
    const cols: QueryColumn[] = (f ?? []).map((x) => ({
      name: x.name,
      dataType: x.dataTypeID != null ? String(x.dataTypeID) : null,
    }))
    const limited = rawRows.slice(0, pageSize)
    return makeQueryData({
      columns: cols,
      rows: limited.map((row) => {
        const o: Record<string, unknown> = {}
        for (const k of Object.keys(row)) {
          o[k] = cellValue(row[k])
        }
        return o
      }),
      totalRows: rawRows.length,
      page: 1,
      pageSize,
      durationMs: Date.now() - t0,
      paginatable: false,
      truncated: rawRows.length > pageSize,
    })
  } catch (e) {
    if (cancelled) {
      throw new QueryCancelledError()
    }
    throw e
  } finally {
    if (queryRunId) {
      unregisterQueryRun(queryRunId)
    }
    if (!cancelled) {
      await cl.end().catch(() => {})
    }
  }
}

function runSqlite(
  record: ConnectionRecord,
  sql: string,
  page: number,
  pageSize: number,
  t0: number,
): QueryExecuteData {
  const p = record.filePath
  if (!p) {
    throw new Error('缺少 SQLite 文件路径')
  }
  const db = new Database(p, { fileMustExist: true, timeout: 5_000 })
  try {
    if (supportsWrappedPagination(sql)) {
      const off = (Math.max(1, page) - 1) * Math.max(1, pageSize)
      const countStmt = db.prepare(
        `SELECT COUNT(*) AS c FROM (${sql}) AS _biu_page_count`,
      )
      const countRow = countStmt.get() as { c?: number | string } | undefined
      const totalRows = Number(countRow?.c ?? 0)
      const stmt = db.prepare(
        `SELECT * FROM (${sql}) AS _biu_page_rows LIMIT ? OFFSET ?`,
      )
      const colMeta = stmt.columns()
      const columns: QueryColumn[] = colMeta.map((c) => ({
        name: c.name,
        dataType: c.type ?? null,
      }))
      const pageRows = stmt.all(pageSize, off) as Record<string, unknown>[]
      return makeQueryData({
        columns,
        rows: toRows(
          pageRows as unknown[],
          columns.length > 0 ? columns.map((c) => c.name) : Object.keys(pageRows[0] ?? {}),
        ),
        totalRows,
        page,
        pageSize,
        durationMs: Date.now() - t0,
        paginatable: true,
        truncated: false,
      })
    }

    const stmt = db.prepare(sql)
    if (!stmt.reader) {
      const info = stmt.run()
      return makeQueryData({
        columns: [],
        rows: [],
        totalRows: info.changes,
        page: 1,
        pageSize,
        durationMs: Date.now() - t0,
        paginatable: false,
        truncated: false,
      })
    }
    const colMeta = stmt.columns()
    const columns: QueryColumn[] = colMeta.map((c) => ({
      name: c.name,
      dataType: c.type ?? null,
    }))
    const all = stmt.all() as Record<string, unknown>[]
    const names = columns.map((c) => c.name)
    const limited = all.slice(0, pageSize)
    return makeQueryData({
      columns,
      rows: toRows(
        limited as unknown[],
        names.length > 0 ? names : Object.keys((limited[0] as object) ?? {}),
      ),
      totalRows: all.length,
      page: 1,
      pageSize,
      durationMs: Date.now() - t0,
      paginatable: false,
      truncated: all.length > pageSize,
    })
  } finally {
    db.close()
  }
}
