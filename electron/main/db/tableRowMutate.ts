import { createConnection, type ResultSetHeader } from 'mysql2/promise'
import { Client } from 'pg'
import Database from 'better-sqlite3'
import type { ConnectionRecord } from '../../../shared/dto/connection'
import type { TableRef } from '../../../shared/dto/table'
import type { TableRowMutationData } from '../../../shared/dto/table'
import { getConnectionPassword } from '../services/connectionPasswordStore'
import {
  assertIdent,
  myQuoteDbTable,
  pgQuoteSchemaTable,
  slQuoteTable,
} from './tableMetadata'

function rejectView(kind: 'table' | 'view') {
  if (kind === 'view') {
    throw new Error('视图数据不支持在表格内增删改')
  }
}

function myQuoteCol(n: string) {
  assertIdent(n, '列')
  return `\`${n.replaceAll('`', '``')}\``
}

function pgQuoteCol(n: string) {
  assertIdent(n, '列')
  return `"${n.replaceAll('"', '""')}"`
}

function slCol(n: string) {
  assertIdent(n, '列')
  return `"${n.replaceAll('"', '""')}"`
}

function myWhere(
  pkCols: string[],
  row: Record<string, unknown>,
): { sql: string; params: unknown[] } {
  const parts: string[] = []
  const params: unknown[] = []
  for (const col of pkCols) {
    const v = row[col]
    if (v == null) {
      parts.push(`${myQuoteCol(col)} IS NULL`)
    } else {
      parts.push(`${myQuoteCol(col)} = ?`)
      params.push(v)
    }
  }
  return { sql: parts.join(' AND '), params }
}

function pgWhere(
  pkCols: string[],
  row: Record<string, unknown>,
  paramOffset: number,
): { sql: string; params: unknown[]; next: number } {
  const parts: string[] = []
  const params: unknown[] = []
  let n = paramOffset
  for (const col of pkCols) {
    const v = row[col]
    if (v == null) {
      parts.push(`${pgQuoteCol(col)} IS NULL`)
    } else {
      n += 1
      parts.push(`${pgQuoteCol(col)} = $${n}`)
      params.push(v)
    }
  }
  return { sql: parts.join(' AND '), params, next: n }
}

function slWhere(
  pkCols: string[],
  row: Record<string, unknown>,
): { sql: string; params: unknown[] } {
  const parts: string[] = []
  const params: unknown[] = []
  for (const col of pkCols) {
    const v = row[col]
    if (v == null) {
      parts.push(`${slCol(col)} IS NULL`)
    } else {
      parts.push(`${slCol(col)} = ?`)
      params.push(v)
    }
  }
  return { sql: parts.join(' AND '), params }
}

export async function updateTableRow(
  record: ConnectionRecord,
  table: string,
  kind: 'table' | 'view',
  ref: TableRef | undefined,
  primaryKey: Record<string, unknown>,
  changes: Record<string, unknown>,
  primaryKeyColumnNames: string[],
): Promise<TableRowMutationData> {
  rejectView(kind)
  if (primaryKeyColumnNames.length === 0) {
    throw new Error('表无主键，无法更新行')
  }
  for (const col of primaryKeyColumnNames) {
    if (!Object.prototype.hasOwnProperty.call(primaryKey, col)) {
      throw new Error(`主键行数据缺少列：${col}`)
    }
  }
  const ch = Object.fromEntries(
    Object.entries(changes).filter(
      ([k, v]) => v !== undefined && !primaryKeyColumnNames.includes(k),
    ),
  )
  if (Object.keys(ch).length === 0) {
    return { affected: 0 }
  }
  for (const k of Object.keys(ch)) {
    assertIdent(k, '列')
  }

  if (record.type === 'mysql') {
    return updateMysql(
      record,
      table,
      ref,
      primaryKey,
      ch,
      primaryKeyColumnNames,
    )
  }
  if (record.type === 'postgres') {
    return updatePostgres(
      record,
      table,
      ref,
      primaryKey,
      ch,
      primaryKeyColumnNames,
    )
  }
  if (record.type === 'sqlite') {
    return updateSqlite(
      record,
      table,
      primaryKey,
      ch,
      primaryKeyColumnNames,
    )
  }
  throw new Error('不支持的连接类型')
}

async function updateMysql(
  record: ConnectionRecord,
  table: string,
  ref: TableRef | undefined,
  primaryKey: Record<string, unknown>,
  changes: Record<string, unknown>,
  primaryKeyColumnNames: string[],
): Promise<TableRowMutationData> {
  const db = ref?.database ?? record.database
  if (!db) {
    throw new Error('MySQL 需要 database（连接或 ref）')
  }
  assertIdent(db, 'database')
  assertIdent(table, 'table')
  const full = myQuoteDbTable(db, table)
  const setParts: string[] = []
  const setParams: unknown[] = []
  for (const [col, v] of Object.entries(changes)) {
    if (v == null) {
      setParts.push(`${myQuoteCol(col)} = NULL`)
    } else {
      setParts.push(`${myQuoteCol(col)} = ?`)
      setParams.push(v)
    }
  }
  const w = myWhere(primaryKeyColumnNames, primaryKey)
  const sql = `UPDATE ${full} SET ${setParts.join(', ')} WHERE ${w.sql}`
  const allParams = [...setParams, ...w.params]
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
    const [r] = await c.query(sql, allParams)
    const aff = (r as ResultSetHeader).affectedRows
    return { affected: aff }
  } finally {
    await c.end()
  }
}

async function updatePostgres(
  record: ConnectionRecord,
  table: string,
  ref: TableRef | undefined,
  primaryKey: Record<string, unknown>,
  changes: Record<string, unknown>,
  primaryKeyColumnNames: string[],
): Promise<TableRowMutationData> {
  const schema = ref?.schema
  if (!schema) {
    throw new Error('PostgreSQL 需要 ref.schema')
  }
  assertIdent(schema, 'schema')
  assertIdent(table, 'table')
  const full = pgQuoteSchemaTable(schema, table)
  const setParts: string[] = []
  const setParams: unknown[] = []
  let n = 0
  for (const [col, v] of Object.entries(changes)) {
    if (v == null) {
      setParts.push(`${pgQuoteCol(col)} = NULL`)
    } else {
      n += 1
      setParts.push(`${pgQuoteCol(col)} = $${n}`)
      setParams.push(v)
    }
  }
  const w = pgWhere(primaryKeyColumnNames, primaryKey, n)
  const sql = `UPDATE ${full} SET ${setParts.join(', ')} WHERE ${w.sql}`
  const allParams = [...setParams, ...w.params]
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
    const r = await cl.query(sql, allParams)
    return { affected: r.rowCount ?? 0 }
  } finally {
    await cl.end()
  }
}

function updateSqlite(
  record: ConnectionRecord,
  table: string,
  primaryKey: Record<string, unknown>,
  changes: Record<string, unknown>,
  primaryKeyColumnNames: string[],
): TableRowMutationData {
  const p = record.filePath
  if (!p) {
    throw new Error('缺少 SQLite 文件路径')
  }
  assertIdent(table, 'table')
  const full = slQuoteTable(table)
  const setParts: string[] = []
  const setParams: unknown[] = []
  for (const [col, v] of Object.entries(changes)) {
    if (v == null) {
      setParts.push(`${slCol(col)} = NULL`)
    } else {
      setParts.push(`${slCol(col)} = ?`)
      setParams.push(v)
    }
  }
  const w = slWhere(primaryKeyColumnNames, primaryKey)
  const sql = `UPDATE ${full} SET ${setParts.join(', ')} WHERE ${w.sql}`
  const db = new Database(p, { fileMustExist: true, timeout: 5_000 })
  try {
    const st = db.prepare(sql)
    const aff = st.run(...setParams, ...w.params)
    return { affected: aff.changes }
  } finally {
    db.close()
  }
}

const INTERNAL_ROW_KEYS = new Set(['_isNew', '_tempId', '__agGridId', '__rowId'])

function sanitizeInsertRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([k, v]) => !INTERNAL_ROW_KEYS.has(k) && v !== undefined,
    ),
  )
}

export async function insertTableRow(
  record: ConnectionRecord,
  table: string,
  kind: 'table' | 'view',
  ref: TableRef | undefined,
  row: Record<string, unknown>,
): Promise<TableRowMutationData> {
  rejectView(kind)
  const r = sanitizeInsertRow(row)
  if (Object.keys(r).length === 0) {
    throw new Error('没有可插入的列')
  }
  for (const k of Object.keys(r)) {
    assertIdent(k, '列')
  }

  if (record.type === 'mysql') {
    return insertMysql(record, table, ref, r)
  }
  if (record.type === 'postgres') {
    return insertPostgres(record, table, ref, r)
  }
  if (record.type === 'sqlite') {
    return insertSqlite(record, table, r)
  }
  throw new Error('不支持的连接类型')
}

async function insertMysql(
  record: ConnectionRecord,
  table: string,
  ref: TableRef | undefined,
  row: Record<string, unknown>,
): Promise<TableRowMutationData> {
  const db = ref?.database ?? record.database
  if (!db) {
    throw new Error('MySQL 需要 database（连接或 ref）')
  }
  assertIdent(db, 'database')
  assertIdent(table, 'table')
  const full = myQuoteDbTable(db, table)
  const keys = Object.keys(row)
  const qcols = keys.map((k) => myQuoteCol(k))
  const placeholders = keys.map(() => '?').join(', ')
  const vals = keys.map((k) => {
    const v = row[k]
    return v === null || v === undefined ? null : v
  })
  const sql = `INSERT INTO ${full} (${qcols.join(', ')}) VALUES (${placeholders})`
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
    const [r2] = await c.query(sql, vals)
    const aff = (r2 as ResultSetHeader).affectedRows
    return { affected: aff }
  } finally {
    await c.end()
  }
}

async function insertPostgres(
  record: ConnectionRecord,
  table: string,
  ref: TableRef | undefined,
  row: Record<string, unknown>,
): Promise<TableRowMutationData> {
  const schema = ref?.schema
  if (!schema) {
    throw new Error('PostgreSQL 需要 ref.schema')
  }
  assertIdent(schema, 'schema')
  assertIdent(table, 'table')
  const full = pgQuoteSchemaTable(schema, table)
  const keys = Object.keys(row)
  const qcols = keys.map((k) => pgQuoteCol(k))
  const values = keys.map((k) => {
    const v = row[k]
    return v === null || v === undefined ? null : v
  })
  const ph = keys.map((_, i) => `$${i + 1}`).join(', ')
  const sql = `INSERT INTO ${full} (${qcols.join(', ')}) VALUES (${ph})`
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
    const r = await cl.query(sql, values)
    return { affected: r.rowCount ?? 0 }
  } finally {
    await cl.end()
  }
}

function insertSqlite(
  record: ConnectionRecord,
  table: string,
  row: Record<string, unknown>,
): TableRowMutationData {
  const p = record.filePath
  if (!p) {
    throw new Error('缺少 SQLite 文件路径')
  }
  assertIdent(table, 'table')
  const full = slQuoteTable(table)
  const keys = Object.keys(row)
  const qcols = keys.map((k) => slCol(k))
  const ph = keys.map(() => '?').join(', ')
  const vals = keys.map((k) => {
    const v = row[k]
    return v === null || v === undefined ? null : v
  })
  const sql = `INSERT INTO ${full} (${qcols.join(', ')}) VALUES (${ph})`
  const db = new Database(p, { fileMustExist: true, timeout: 5_000 })
  try {
    const st = db.prepare(sql)
    const aff = st.run(...vals)
    return { affected: aff.changes }
  } finally {
    db.close()
  }
}

export async function deleteTableRow(
  record: ConnectionRecord,
  table: string,
  kind: 'table' | 'view',
  ref: TableRef | undefined,
  primaryKey: Record<string, unknown>,
  primaryKeyColumnNames: string[],
): Promise<TableRowMutationData> {
  rejectView(kind)
  if (primaryKeyColumnNames.length === 0) {
    throw new Error('表无主键，无法删除行')
  }
  for (const col of primaryKeyColumnNames) {
    if (!Object.prototype.hasOwnProperty.call(primaryKey, col)) {
      throw new Error(`主键行数据缺少列：${col}`)
    }
  }

  if (record.type === 'mysql') {
    return deleteMysql(record, table, ref, primaryKey, primaryKeyColumnNames)
  }
  if (record.type === 'postgres') {
    return deletePostgres(
      record,
      table,
      ref,
      primaryKey,
      primaryKeyColumnNames,
    )
  }
  if (record.type === 'sqlite') {
    return deleteSqlite(record, table, primaryKey, primaryKeyColumnNames)
  }
  throw new Error('不支持的连接类型')
}

async function deleteMysql(
  record: ConnectionRecord,
  table: string,
  ref: TableRef | undefined,
  primaryKey: Record<string, unknown>,
  primaryKeyColumnNames: string[],
): Promise<TableRowMutationData> {
  const db = ref?.database ?? record.database
  if (!db) {
    throw new Error('MySQL 需要 database（连接或 ref）')
  }
  assertIdent(db, 'database')
  assertIdent(table, 'table')
  const full = myQuoteDbTable(db, table)
  const w = myWhere(primaryKeyColumnNames, primaryKey)
  const sql = `DELETE FROM ${full} WHERE ${w.sql}`
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
    const [r] = await c.query(sql, w.params)
    const aff = (r as ResultSetHeader).affectedRows
    return { affected: aff }
  } finally {
    await c.end()
  }
}

async function deletePostgres(
  record: ConnectionRecord,
  table: string,
  ref: TableRef | undefined,
  primaryKey: Record<string, unknown>,
  primaryKeyColumnNames: string[],
): Promise<TableRowMutationData> {
  const schema = ref?.schema
  if (!schema) {
    throw new Error('PostgreSQL 需要 ref.schema')
  }
  assertIdent(schema, 'schema')
  assertIdent(table, 'table')
  const full = pgQuoteSchemaTable(schema, table)
  const w = pgWhere(primaryKeyColumnNames, primaryKey, 0)
  const sql = `DELETE FROM ${full} WHERE ${w.sql}`
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
    const r = await cl.query(sql, w.params)
    return { affected: r.rowCount ?? 0 }
  } finally {
    await cl.end()
  }
}

function deleteSqlite(
  record: ConnectionRecord,
  table: string,
  primaryKey: Record<string, unknown>,
  primaryKeyColumnNames: string[],
): TableRowMutationData {
  const p = record.filePath
  if (!p) {
    throw new Error('缺少 SQLite 文件路径')
  }
  assertIdent(table, 'table')
  const full = slQuoteTable(table)
  const w = slWhere(primaryKeyColumnNames, primaryKey)
  const sql = `DELETE FROM ${full} WHERE ${w.sql}`
  const db = new Database(p, { fileMustExist: true, timeout: 5_000 })
  try {
    const st = db.prepare(sql)
    const aff = st.run(...w.params)
    return { affected: aff.changes }
  } finally {
    db.close()
  }
}
