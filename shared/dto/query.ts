export type QueryContext = {
  /** MySQL 默认数据库 */
  database?: string
  /** PostgreSQL 默认 schema */
  schema?: string
}

export type QueryExecutePayload = {
  connectionId: string
  sql: string
  /** 最大行数，防止一次拉爆内存；未传时由主进程设默认 */
  maxRows?: number
  /** 每页行数；若未传则回退到 maxRows */
  pageSize?: number
  /** 查询结果页码，1-based；execute 默认为第一页 */
  page?: number
  /** 查询超时时间，毫秒；由主进程尽力中断，未传则使用默认值 */
  queryTimeoutMs?: number
  /** 来自对象树当前选择的默认库/Schema，用于解析未限定表名 */
  queryContext?: QueryContext
  /**
   * 可选；传入时可通过 `query:cancel` 中断（MySQL / PostgreSQL）。
   * 应用侧建议每次执行生成新的 UUID。
   */
  queryRunId?: string
}

export type QueryFetchPagePayload = {
  connectionId: string
  sql: string
  page: number
  pageSize: number
  queryTimeoutMs?: number
  queryContext?: QueryContext
  queryRunId?: string
}

export type QueryCancelPayload = {
  queryRunId: string
}

export type QueryCancelData = {
  /** 是否对运行中的查询执行了取消（SQLite 未登记则为 false） */
  cancelled: boolean
}

export type QueryColumn = {
  name: string
  /** 与驱动相关的类型名，可空 */
  dataType: string | null
}

export type QueryExecuteData = {
  columns: QueryColumn[]
  /** JSON 可序列化单元格；BigInt/Buffer/Date 已转换 */
  rows: Record<string, unknown>[]
  /** 当前页码（1-based） */
  page: number
  pageSize: number
  /** 查询总行数；非分页语句下等于 rowCount */
  totalRows: number
  totalPages: number
  paginatable: boolean
  rowCount: number
  durationMs: number
  truncated: boolean
}

export type QueryResultSet = QueryExecuteData & {
  id: string
  /** 0-based 语句序号 */
  statementIndex: number
  /** 该结果集对应的 SQL 语句 */
  sql: string
  /** 执行该结果集时使用的默认库/Schema，用于后续翻页保持一致 */
  queryContext?: QueryContext
}

export type QueryExecuteResult = {
  results: QueryResultSet[]
  totalDurationMs: number
}
