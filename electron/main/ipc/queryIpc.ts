import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { err, ok, type ApiResult } from '../../../shared/dto/api-result'
import type {
  QueryCancelData,
  QueryCancelPayload,
  QueryExecuteData,
  QueryExecuteResult,
  QueryExecutePayload,
  QueryFetchPagePayload,
} from '../../../shared/dto/query'
import { QueryCancelledError } from '../db/queryRun'
import { getDatabaseAdapter } from '../db/adapterFactory'
import { getConnectionById } from '../services/connectionResolver'
import { cancelQueryRun } from '../services/queryRunRegistry'
import { IPC_CHANNELS } from '../../../shared/ipc/channels'
import { writeAppLog } from '../services/appLogger'

const DEFAULT_QUERY_TIMEOUT_MS = 30_000
const MAX_QUERY_TIMEOUT_MS = 600_000

function normalizeQueryTimeout(timeoutMs: number | undefined): number {
  return Math.min(
    MAX_QUERY_TIMEOUT_MS,
    Math.max(1_000, timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS),
  )
}

async function withQueryTimeout<T>(
  promise: Promise<T>,
  queryRunId: string,
  timeoutMs: number,
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          cancelQueryRun(queryRunId)
          reject(new QueryCancelledError())
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
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

export function registerQueryIpc() {
  ipcMain.handle(
    IPC_CHANNELS.QUERY_EXECUTE,
    async (_e, p: QueryExecutePayload) => {
      try {
        if (!p.sql || !p.sql.trim()) {
          return err('QUERY_VALIDATION', 'SQL 不能为空')
        }
        const rec = await getConnectionById(p.connectionId)
        if (!rec) {
          return err('CONNECTION_NOT_FOUND', '未找到该连接')
        }
        const pageSize = Math.min(10_000, Math.max(1, p.pageSize ?? p.maxRows ?? 100))
        const queryRunId = p.queryRunId ?? randomUUID()
        const timeoutMs = normalizeQueryTimeout(p.queryTimeoutMs)
        const adapter = getDatabaseAdapter(rec)
        const data: QueryExecuteResult = await withQueryTimeout(
          adapter.executeQuery(rec, p.sql, pageSize, queryRunId, p.queryContext),
          queryRunId,
          timeoutMs,
        )
        return ok(data)
      } catch (e) {
        if (e instanceof QueryCancelledError) {
          return err('QUERY_CANCELLED', '查询已取消')
        }
        return wrapError(e, 'QUERY_FAILED')
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.QUERY_FETCH_PAGE,
    async (_e, p: QueryFetchPagePayload): Promise<ApiResult<QueryExecuteData>> => {
      try {
        if (!p.sql || !p.sql.trim()) {
          return err('QUERY_VALIDATION', 'SQL 不能为空')
        }
        const rec = await getConnectionById(p.connectionId)
        if (!rec) {
          return err('CONNECTION_NOT_FOUND', '未找到该连接')
        }
        const page = Math.max(1, p.page || 1)
        const pageSize = Math.min(10_000, Math.max(1, p.pageSize || 100))
        const queryRunId = p.queryRunId ?? randomUUID()
        const timeoutMs = normalizeQueryTimeout(p.queryTimeoutMs)
        const adapter = getDatabaseAdapter(rec)
        const data = await withQueryTimeout(
          adapter.fetchQueryPage(
            rec,
            p.sql,
            page,
            pageSize,
            queryRunId,
            p.queryContext,
          ),
          queryRunId,
          timeoutMs,
        )
        return ok(data)
      } catch (e) {
        if (e instanceof QueryCancelledError) {
          return err('QUERY_CANCELLED', '查询已取消')
        }
        return wrapError(e, 'QUERY_FAILED')
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.QUERY_CANCEL,
    async (_e, p: QueryCancelPayload): Promise<ApiResult<QueryCancelData>> => {
      if (!p?.queryRunId?.trim()) {
        return err('QUERY_VALIDATION', '缺少 queryRunId')
      }
      const cancelled = cancelQueryRun(p.queryRunId)
      return ok({ cancelled })
    },
  )
}
