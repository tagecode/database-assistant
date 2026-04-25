import fs from 'node:fs'
import { createConnection } from 'mysql2/promise'
import { Client } from 'pg'
import Database from 'better-sqlite3'
import type { ConnectionRecord, DatabaseKind } from '../../../shared/dto/connection'
import type {
  DatabaseAdapter,
  ResolvedConnectionTestInput,
} from '../../../shared/adapter/databasePort'
import { supportsQueryCancel } from '../../../shared/adapter/capabilities'
import { loadExplorerChildren } from './explorerLoadChildren'
import { fetchSqlQueryPage, runSqlQuery } from './queryRun'
import {
  getPrimaryKeyColumnNames,
  getTableData,
  getTableStructure,
} from './tableMetadata'
import {
  deleteTableRow,
  insertTableRow,
  updateTableRow,
} from './tableRowMutate'

async function testMysql(input: ResolvedConnectionTestInput): Promise<void> {
  if (!input.host) {
    throw new Error('请填写主机')
  }
  const conn = await createConnection({
    host: input.host,
    port: input.port ?? 3306,
    user: input.user,
    password: input.password,
    database: input.database,
    connectTimeout: 8_000,
  })
  try {
    await conn.query('SELECT 1 as ok')
  } finally {
    await conn.end()
  }
}

async function testPostgres(input: ResolvedConnectionTestInput): Promise<void> {
  if (!input.host) {
    throw new Error('请填写主机')
  }
  const cl = new Client({
    host: input.host,
    port: input.port ?? 5432,
    user: input.user,
    password: input.password,
    database: input.database || 'postgres',
    connectionTimeoutMillis: 8_000,
  })
  try {
    await cl.connect()
    await cl.query('SELECT 1')
  } finally {
    await cl.end()
  }
}

async function testSqlite(input: ResolvedConnectionTestInput): Promise<void> {
  if (!input.filePath) {
    throw new Error('请填写或选择 SQLite 文件路径')
  }
  if (!fs.existsSync(input.filePath)) {
    throw new Error('文件不存在')
  }
  const db = new Database(input.filePath, { timeout: 5_000 })
  try {
    db.prepare('SELECT 1 as ok').get()
  } finally {
    db.close()
  }
}

function makeAdapter(type: DatabaseKind): DatabaseAdapter {
  return {
    type,
    capabilities: {
      queryCancel: supportsQueryCancel(type),
      rowMutation: true,
    },
    testConnection: async (input) => {
      if (type === 'mysql') {
        await testMysql(input)
        return
      }
      if (type === 'postgres') {
        await testPostgres(input)
        return
      }
      await testSqlite(input)
    },
    loadExplorerChildren: async (record, parentKey) =>
      loadExplorerChildren(record, parentKey),
    executeQuery: async (record, sql, pageSize, queryRunId, queryContext) =>
      runSqlQuery(record, sql, pageSize, queryRunId, queryContext),
    fetchQueryPage: async (record, sql, page, pageSize, queryRunId, queryContext) =>
      fetchSqlQueryPage(record, sql, page, pageSize, queryRunId, queryContext),
    getTableStructure: async (record, table, kind, ref) =>
      getTableStructure(record, table, kind, ref),
    getTableData: async (record, table, kind, ref, page, pageSize) =>
      getTableData(record, table, kind, ref, page, pageSize),
    getPrimaryKeyColumnNames: async (record, table, ref) =>
      getPrimaryKeyColumnNames(record, table, ref),
    updateTableRow: async (
      record,
      table,
      kind,
      ref,
      primaryKey,
      changes,
      primaryKeyColumnNames,
    ) =>
      updateTableRow(
        record,
        table,
        kind,
        ref,
        primaryKey,
        changes,
        primaryKeyColumnNames,
      ),
    insertTableRow: async (record, table, kind, ref, row) =>
      insertTableRow(record, table, kind, ref, row),
    deleteTableRow: async (
      record,
      table,
      kind,
      ref,
      primaryKey,
      primaryKeyColumnNames,
    ) =>
      deleteTableRow(
        record,
        table,
        kind,
        ref,
        primaryKey,
        primaryKeyColumnNames,
      ),
  }
}

const adapters: Record<DatabaseKind, DatabaseAdapter> = {
  mysql: makeAdapter('mysql'),
  postgres: makeAdapter('postgres'),
  sqlite: makeAdapter('sqlite'),
}

export function getDatabaseAdapterByKind(kind: DatabaseKind): DatabaseAdapter {
  return adapters[kind]
}

export function getDatabaseAdapter(record: ConnectionRecord): DatabaseAdapter {
  return getDatabaseAdapterByKind(record.type)
}
