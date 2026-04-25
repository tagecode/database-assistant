import {
  colorSchemeDark,
  colorSchemeLight,
  themeQuartz,
  type CellClickedEvent,
  type CellContextMenuEvent,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
} from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import Editor, { type OnChange } from '@monaco-editor/react'
import {
  Alert,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import type { editor } from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { exportQueryResultToCsv } from './exportQueryResultCsv'
import { ensureAgGridModules } from '@/lib/agGridSetup'
import { useUIStore } from '@/stores/uiStore'
import { useShallow } from 'zustand/shallow'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { QueryResultSet } from '@shared/dto/query'

type ResultGridRow = Record<string, unknown> & {
  __rowId: string
}

function formatClipboardCell(value: unknown) {
  if (value == null) {
    return ''
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

function formatClipboardTsvCell(value: unknown) {
  return formatClipboardCell(value).replaceAll('\t', '  ').replaceAll('\r\n', '\n').replaceAll('\n', '\\n')
}

function buildResultHeaderLine(columnNames: string[]) {
  return columnNames.map((name) => formatClipboardTsvCell(name)).join('\t')
}

function buildResultTsv(
  columnNames: string[],
  rows: Record<string, unknown>[],
  includeHeader: boolean,
) {
  const lines: string[] = []
  if (includeHeader) {
    lines.push(buildResultHeaderLine(columnNames))
  }
  for (const row of rows) {
    lines.push(columnNames.map((name) => formatClipboardTsvCell(row[name])).join('\t'))
  }
  return lines.join('\n')
}

function sanitizeResultRow(row: Record<string, unknown>) {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === '__rowId') {
      continue
    }
    next[key] = value
  }
  return next
}

export function SqlWorkbench() {
  const api = window.electronAPI
  const colorMode = useUIStore((s) => s.colorMode)
  const editorFontSize = useUIStore((s) => s.editorFontSize)
  const queryTimeoutMs = useUIStore((s) => s.queryTimeoutMs)
  const appendExecutionLog = useUIStore((s) => s.appendExecutionLog)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const queryRunIdRef = useRef<string | null>(null)
  const resultGridApiRef = useRef<GridApi<ResultGridRow> | null>(null)
  const [loading, setLoading] = useState(false)
  const [resultPageLoading, setResultPageLoading] = useState(false)
  const [loadingPage, setLoadingPage] = useState<number | null>(null)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [infoNotice, setInfoNotice] = useState<string | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const [pageInput, setPageInput] = useState('1')
  const [tabMenu, setTabMenu] = useState<{
    x: number
    y: number
    tabId: string
  } | null>(null)
  const [resultCellMenu, setResultCellMenu] = useState<{
    x: number
    y: number
    column: string
    row: ResultGridRow
  } | null>(null)

  const {
    connectionId,
    selectedQueryContext,
    sqlTabs,
    activeTabId,
    setActiveTab,
    setTabSql,
    addSqlTab,
    closeSqlTab,
    closeOtherSqlTabs,
    closeAllSqlTabs,
    setTabQueryPageSize,
    setTabResults,
    setActiveResultIndex,
    updateTabResult,
    setTabError,
  } = useWorkspaceStore(
    useShallow((s) => ({
      connectionId: s.selectedConnectionId,
      selectedQueryContext: s.selectedQueryContext,
      sqlTabs: s.sqlTabs,
      activeTabId: s.activeTabId,
      setActiveTab: s.setActiveTab,
      setTabSql: s.setTabSql,
      addSqlTab: s.addSqlTab,
      closeSqlTab: s.closeSqlTab,
      closeOtherSqlTabs: s.closeOtherSqlTabs,
      closeAllSqlTabs: s.closeAllSqlTabs,
      setTabQueryPageSize: s.setTabQueryPageSize,
      setTabResults: s.setTabResults,
      setActiveResultIndex: s.setActiveResultIndex,
      updateTabResult: s.updateTabResult,
      setTabError: s.setTabError,
    })),
  )

  const showCopyNotice = useCallback((message: string) => {
    setCopyNotice(message)
  }, [])

  const activeTab = sqlTabs.find((t) => t.id === activeTabId) ?? sqlTabs[0]
  const sql = activeTab?.sql ?? ''
  const err = activeTab?.lastError ?? null
  const results = activeTab?.lastResults ?? []
  const activeResultIndex = activeTab?.activeResultIndex ?? 0
  const totalDurationMs = activeTab?.lastTotalDurationMs ?? 0
  const result: QueryResultSet | null = results[activeResultIndex] ?? null
  const queryPageSize = activeTab?.queryPageSize ?? 200
  const activeQueryContext = activeTab?.queryContext ?? selectedQueryContext ?? null
  const busy = loading || resultPageLoading

  useEffect(() => {
    ensureAgGridModules()
  }, [])

  const switchToTab = useCallback(
    (id: string) => {
      if (id === activeTabId) {
        return
      }
      const ed = editorRef.current
      if (ed && activeTabId) {
        setTabSql(activeTabId, ed.getValue())
      }
      setActiveTab(id)
    },
    [activeTabId, setActiveTab, setTabSql],
  )

  const onChange: OnChange = useCallback(
    (v) => {
      if (!activeTabId) {
        return
      }
      setTabSql(activeTabId, v ?? '')
    },
    [activeTabId, setTabSql],
  )

  const getSqlAll = useCallback(() => {
    const ed = editorRef.current
    const fromEditor = ed?.getModel()?.getValue()
    const raw = (fromEditor ?? sql).trim()
    return raw.length ? raw : null
  }, [sql])

  const getSqlSelection = useCallback(() => {
    const ed = editorRef.current
    const model = ed?.getModel()
    if (!ed || !model) {
      return null
    }
    const sel = ed.getSelection()
    if (!sel || sel.isEmpty()) {
      return null
    }
    const t = model.getValueInRange(sel).trim()
    return t.length ? t : null
  }, [])

  const executeSql = useCallback(
    async (sqlText: string) => {
      if (!api || !activeTabId) {
        return
      }
      // 从 store 实时读取 selectedConnectionId，避免 Monaco onMount 闭包过期问题
      const workspace = useWorkspaceStore.getState()
      const connId = workspace.selectedConnectionId
      const queryContext =
        workspace.sqlTabs.find((t) => t.id === activeTabId)?.queryContext ??
        workspace.selectedQueryContext ??
        undefined
      if (!connId) {
        setTabError(activeTabId, '请先在侧栏选择连接')
        return
      }
      if (!sqlText.trim()) {
        setTabError(activeTabId, 'SQL 为空')
        return
      }
      setInfoNotice(null)
      setTabError(activeTabId, null)
      setTabResults(activeTabId, [], 0)
      const queryRunId =
        globalThis.crypto?.randomUUID?.() ??
        `q-${Date.now()}-${Math.random().toString(16).slice(2)}`
      queryRunIdRef.current = queryRunId
      appendExecutionLog({
        level: 'info',
        title: `开始执行 SQL`,
        detail: sqlText,
      })
      setLoading(true)
      try {
        const r = await api.query.execute({
          connectionId: connId,
          sql: sqlText,
          pageSize: queryPageSize,
          queryTimeoutMs,
          queryContext,
          queryRunId,
        })
        if (!r.success) {
          if (r.error.code === 'QUERY_CANCELLED') {
            setTabError(activeTabId, null)
            setTabResults(activeTabId, [], 0)
            setInfoNotice('查询已取消')
            appendExecutionLog({
              level: 'warning',
              title: 'SQL 已取消',
              detail: sqlText,
            })
            return
          }
          setTabError(activeTabId, r.error.message)
          appendExecutionLog({
            level: 'error',
            title: 'SQL 执行失败',
            detail: `${r.error.message}\n\n${sqlText}`,
          })
          return
        }
        setTabResults(activeTabId, r.data.results, r.data.totalDurationMs)
        appendExecutionLog({
          level: 'success',
          title: `SQL 执行完成（${r.data.results.length} 个结果集）`,
          detail: `${
            queryContext?.database
              ? `默认数据库：${queryContext.database}\n`
              : queryContext?.schema
                ? `默认 Schema：${queryContext.schema}\n`
                : ''
          }总耗时 ${r.data.totalDurationMs} ms\n\n${sqlText}`,
        })
      } finally {
        setLoading(false)
        queryRunIdRef.current = null
      }
    },
    [
      api,
      activeTabId,
      appendExecutionLog,
      queryPageSize,
      queryTimeoutMs,
      setTabError,
      setTabResults,
    ],
  )

  const fetchResultPage = useCallback(
    async (nextPage: number) => {
      if (!api || !activeTabId || !result) {
        return
      }
      const connId = useWorkspaceStore.getState().selectedConnectionId
      const queryContext = result.queryContext ?? activeQueryContext ?? undefined
      if (!connId) {
        setTabError(activeTabId, '请先在侧栏选择连接')
        return
      }
      const queryRunId =
        globalThis.crypto?.randomUUID?.() ??
        `q-${Date.now()}-${Math.random().toString(16).slice(2)}`
      queryRunIdRef.current = queryRunId
      setInfoNotice(null)
      setResultPageLoading(true)
      setLoadingPage(Math.max(1, nextPage))
      appendExecutionLog({
        level: 'info',
        title: '开始加载结果页',
        detail: `${result.sql}\n\n第 ${Math.max(1, nextPage)} 页 · 每页 ${queryPageSize} 行`,
      })
      try {
        const r = await api.query.fetchPage({
          connectionId: connId,
          sql: result.sql,
          page: Math.max(1, nextPage),
          pageSize: queryPageSize,
          queryTimeoutMs,
          queryContext,
          queryRunId,
        })
        if (!r.success) {
          if (r.error.code === 'QUERY_CANCELLED') {
            setInfoNotice('查询已取消')
            appendExecutionLog({
              level: 'warning',
              title: '结果页加载已取消',
              detail: result.sql,
            })
            return
          }
          setInfoNotice(r.error.message)
          appendExecutionLog({
            level: 'error',
            title: '结果页加载失败',
            detail: `${r.error.message}\n\n${result.sql}`,
          })
          return
        }
        updateTabResult(activeTabId, activeResultIndex, {
          ...r.data,
        })
        appendExecutionLog({
          level: 'success',
          title: '结果页加载完成',
          detail: `第 ${r.data.page}/${r.data.totalPages} 页 · 本页 ${r.data.rows.length} 行 / 总 ${r.data.totalRows} 行`,
        })
      } finally {
        setResultPageLoading(false)
        setLoadingPage(null)
        queryRunIdRef.current = null
      }
    },
    [
      activeResultIndex,
      activeTabId,
      api,
      appendExecutionLog,
      queryPageSize,
      queryTimeoutMs,
      result,
      activeQueryContext,
      setTabError,
      updateTabResult,
    ],
  )

  const jumpToResultPage = useCallback(() => {
    if (!result) {
      return
    }
    const parsed = parseInt(pageInput, 10)
    if (!Number.isFinite(parsed)) {
      setInfoNotice('请输入有效页码')
      return
    }
    const targetPage = Math.min(Math.max(1, parsed), result.totalPages)
    void fetchResultPage(targetPage)
  }, [fetchResultPage, pageInput, result])

  const cancelRunningQuery = useCallback(async () => {
    if (!api) {
      return
    }
    const id = queryRunIdRef.current
    if (!id) {
      return
    }
    const r = await api.query.cancel({ queryRunId: id })
    if (!r.success) {
      return
    }
    if (!r.data.cancelled) {
      setInfoNotice('当前查询无法中断（例如 SQLite 为同步执行，或未找到运行中的任务）')
      appendExecutionLog({
        level: 'warning',
        title: '取消请求未生效',
        detail: '当前查询无法中断（例如 SQLite 为同步执行，或未找到运行中的任务）',
      })
    }
  }, [api, appendExecutionLog])

  const runAll = useCallback(() => {
    const q = getSqlAll()
    if (!q) {
      if (activeTabId) {
        setTabError(activeTabId, 'SQL 为空')
      }
      return
    }
    void executeSql(q)
  }, [activeTabId, executeSql, getSqlAll, setTabError])

  const runSelection = useCallback(() => {
    const q = getSqlSelection()
    if (!q) {
      if (activeTabId) {
        setTabError(activeTabId, '请先在编辑器中选中要执行的 SQL')
      }
      return
    }
    void executeSql(q)
  }, [activeTabId, executeSql, getSqlSelection, setTabError])

  const onMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = ed
      const flushActive = () => {
        const id = useWorkspaceStore.getState().activeTabId
        if (id) {
          setTabSql(id, ed.getValue())
        }
      }
      const run = (mode: 'all' | 'selection') => {
        const id = useWorkspaceStore.getState().activeTabId
        if (!id) {
          return
        }
        if (mode === 'all') {
          const text = ed.getModel()?.getValue().trim() ?? ''
          if (text) {
            void executeSql(text)
          } else {
            setTabError(id, 'SQL 为空')
          }
          return
        }
        const model = ed.getModel()
        if (!model) {
          return
        }
        const sel = ed.getSelection()
        if (!sel || sel.isEmpty()) {
          setTabError(id, '请先在编辑器中选中要执行的 SQL')
          return
        }
        const t = model.getValueInRange(sel).trim()
        if (t) {
          void executeSql(t)
        } else {
          setTabError(id, '请先在编辑器中选中要执行的 SQL')
        }
      }
      ed.addAction({
        id: 'biu-exec-sql-all',
        label: '执行全部 SQL',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => run('all'),
      })
      ed.addAction({
        id: 'biu-exec-sql-selection',
        label: '执行选中 SQL',
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        ],
        run: () => run('selection'),
      })
      ed.addAction({
        id: 'biu-new-sql-tab',
        label: '新建 SQL 标签',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT],
        run: () => {
          flushActive()
          addSqlTab()
        },
      })
      ed.addAction({
        id: 'biu-close-sql-tab',
        label: '关闭当前 SQL 标签',
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyW,
        ],
        run: () => {
          const id = useWorkspaceStore.getState().activeTabId
          if (!id) {
            return
          }
          flushActive()
          closeSqlTab(id)
        },
      })
    },
    [addSqlTab, closeSqlTab, executeSql, setTabError, setTabSql],
  )

  const colNames = useMemo(
    () =>
      result
        ? result.columns.length
          ? result.columns.map((c) => c.name)
          : Object.keys(result.rows[0] ?? {})
        : [],
    [result],
  )

  const exportCurrentResultCsv = useCallback(async () => {
    if (!result || exportingCsv) {
      return
    }
    setExportingCsv(true)
    setInfoNotice('正在导出 CSV…')
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
      exportQueryResultToCsv(result)
      setInfoNotice(`已导出 CSV（${result.rows.length} 行）`)
      appendExecutionLog({
        level: 'success',
        title: '查询结果 CSV 已导出',
        detail: `${result.rows.length} 行 · ${colNames.length} 列`,
      })
    } catch (error) {
      setInfoNotice(error instanceof Error ? error.message : '导出 CSV 失败')
      appendExecutionLog({
        level: 'error',
        title: '导出 CSV 失败',
        detail: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setExportingCsv(false)
    }
  }, [appendExecutionLog, colNames.length, exportingCsv, result])

  const resultGridTheme = useMemo(
    () =>
      colorMode === 'dark'
        ? themeQuartz.withPart(colorSchemeDark)
        : themeQuartz.withPart(colorSchemeLight),
    [colorMode],
  )

  const resultRowData = useMemo<ResultGridRow[]>(
    () =>
      result
        ? result.rows.map((row, index) => ({
            ...row,
            __rowId: `${result.id}-${index}`,
          }))
        : [],
    [result],
  )

  const resultColDefs = useMemo<ColDef<ResultGridRow>[]>(
    () =>
      colNames.map((name) => ({
        field: name,
        headerName: name,
        minWidth: 140,
        flex: 1,
        sortable: true,
        resizable: true,
        filter: true,
        valueFormatter: (params) => formatClipboardCell(params.value),
      })),
    [colNames],
  )

  useEffect(() => {
    const t = setTimeout(() => {
      setResultCellMenu(null)
      resultGridApiRef.current?.deselectAll()
    }, 0)
    return () => clearTimeout(t)
  }, [result?.id])

  useEffect(() => {
    const t = setTimeout(() => {
      setPageInput(String(result?.page ?? 1))
    }, 0)
    return () => clearTimeout(t)
  }, [result?.id, result?.page])

  const getFocusedResultCell = useCallback(() => {
    const apiRef = resultGridApiRef.current
    const focused = apiRef?.getFocusedCell()
    if (!apiRef || !focused) {
      return null
    }
    const rowNode = apiRef.getDisplayedRowAtIndex(focused.rowIndex)
    const row = rowNode?.data ?? null
    const column = focused.column.getColId()
    if (!row || !column) {
      return null
    }
    return { row, column }
  }, [])

  const getSelectedResultRows = useCallback(() => {
    const apiRef = resultGridApiRef.current
    if (!apiRef) {
      return []
    }
    return apiRef
      .getSelectedNodes()
      .sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0))
      .map((node) => node.data)
      .filter(Boolean) as ResultGridRow[]
  }, [])

  const copyResultCell = useCallback(
    async (row: Record<string, unknown> | null, column: string) => {
      if (!row) {
        setInfoNotice('没有可复制的单元格')
        return
      }
      const value = formatClipboardCell(row[column])
      try {
        await copyText(value)
        appendExecutionLog({
          level: 'success',
          title: '已复制查询结果单元格',
          detail: `${column} = ${value}`,
        })
        showCopyNotice('已复制单元格')
      } catch (error) {
        setInfoNotice(error instanceof Error ? error.message : '复制单元格失败')
      }
    },
    [appendExecutionLog, showCopyNotice],
  )

  const copyResultRow = useCallback(
    async (row: Record<string, unknown> | null) => {
      if (!row) {
        setInfoNotice('没有可复制的行')
        return
      }
      try {
        await copyText(JSON.stringify(sanitizeResultRow(row), null, 2))
        appendExecutionLog({
          level: 'success',
          title: '已复制查询结果整行',
          detail: '1 行',
        })
        showCopyNotice('已复制整行')
      } catch (error) {
        setInfoNotice(error instanceof Error ? error.message : '复制整行失败')
      }
    },
    [appendExecutionLog, showCopyNotice],
  )

  const copySelectedResultRows = useCallback(async () => {
    const rows = getSelectedResultRows()
    if (rows.length === 0) {
      setInfoNotice('请先选择至少一行')
      return
    }
    try {
      await copyText(
        buildResultTsv(
          colNames,
          rows.map((row) => sanitizeResultRow(row)),
          true,
        ),
      )
      appendExecutionLog({
        level: 'success',
        title: '已复制选中查询结果',
        detail: `${rows.length} 行 · ${colNames.length} 列`,
      })
      showCopyNotice(`已复制 ${rows.length} 行`)
    } catch (error) {
      setInfoNotice(error instanceof Error ? error.message : '复制选中行失败')
    }
  }, [appendExecutionLog, colNames, getSelectedResultRows, showCopyNotice])

  const copyResultHeaders = useCallback(async () => {
    if (!result || colNames.length === 0) {
      setInfoNotice('当前结果没有可复制的表头')
      return
    }
    try {
      await copyText(buildResultHeaderLine(colNames))
      appendExecutionLog({
        level: 'success',
        title: '已复制查询结果表头',
        detail: `${colNames.length} 列`,
      })
      showCopyNotice(`已复制表头（${colNames.length} 列）`)
    } catch (error) {
      setInfoNotice(error instanceof Error ? error.message : '复制表头失败')
    }
  }, [appendExecutionLog, colNames, result, showCopyNotice])

  const copyResultTsv = useCallback(async () => {
    if (!result) {
      return
    }
    if (colNames.length === 0) {
      setInfoNotice('当前结果没有可复制的列')
      return
    }
    try {
      await copyText(buildResultTsv(colNames, result.rows, true))
      appendExecutionLog({
        level: 'success',
        title: '已复制查询结果 TSV',
        detail: `${result.rows.length} 行 · ${colNames.length} 列`,
      })
      showCopyNotice(`已复制 TSV（${result.rows.length} 行）`)
    } catch (error) {
      setInfoNotice(error instanceof Error ? error.message : '复制 TSV 失败')
    }
  }, [appendExecutionLog, colNames, result, showCopyNotice])

  const handleResultKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'c') {
        return
      }
      const focused = getFocusedResultCell()
      if (!result || !focused) {
        return
      }
      if (event.shiftKey) {
        event.preventDefault()
        const selectedRows = getSelectedResultRows()
        if (selectedRows.length > 1) {
          void copySelectedResultRows()
          return
        }
        void copyResultRow(focused.row)
        return
      }
      event.preventDefault()
      void copyResultCell(focused.row, focused.column)
    },
    [
      copyResultCell,
      copyResultRow,
      copySelectedResultRows,
      getFocusedResultCell,
      getSelectedResultRows,
      result,
    ],
  )

  if (!api) {
    return <Alert severity="warning">SQL 工作区需 Electron 环境</Alert>
  }

  if (!activeTab || !activeTabId) {
    return (
      <Alert severity="error" sx={{ m: 1 }}>
        内部错误：无 SQL 标签
      </Alert>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: 1,
        gap: 1.5,
      }}
    >
      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
      >
        <Tooltip title="⌘/Ctrl + Enter">
          <span>
            <Button
              variant="contained"
              size="small"
              disabled={busy || !connectionId}
              onClick={() => void runAll()}
            >
              执行全部
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="⌘/Ctrl + Shift + Enter">
          <span>
            <Button
              variant="outlined"
              size="small"
              disabled={busy || !connectionId}
              onClick={() => void runSelection()}
            >
              执行选中
            </Button>
          </span>
        </Tooltip>
        <Button
          variant="outlined"
          color="warning"
          size="small"
          disabled={!busy}
          onClick={() => void cancelRunningQuery()}
        >
          取消执行
        </Button>
        <TextField
          size="small"
          type="number"
          label="每页行数"
          value={queryPageSize}
          onChange={(e) => {
            if (!activeTabId) {
              return
            }
            setTabQueryPageSize(
              activeTabId,
              Math.min(10_000, Math.max(1, parseInt(e.target.value, 10) || 200)),
            )
          }}
          sx={{ width: 120 }}
        />
        {result && (
          <>
            <Typography variant="body2" color="text.secondary">
              总耗时 {totalDurationMs} ms
              {' · '}
              结果集 {activeResultIndex + 1}/{results.length}
              {' · '}
              当前页 {result.page}/{result.totalPages}
              {' · '}
              本页 {result.rows.length} 行 / 总 {result.totalRows} 行
              {' · '}
              当前页查询 {result.durationMs} ms
            </Typography>
            {!result.paginatable && result.truncated && (
              <Typography variant="caption" color="warning.main">
                当前语句无法安全分页，仅展示前 {result.rows.length} 行
              </Typography>
            )}
            {resultPageLoading && loadingPage != null && (
              <Typography variant="caption" color="primary.main">
                正在加载第 {loadingPage} 页…
              </Typography>
            )}
            {result.paginatable && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy || result.page <= 1}
                  onClick={() => void fetchResultPage(1)}
                >
                  首页
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy || result.page <= 1}
                  onClick={() => void fetchResultPage(result.page - 1)}
                >
                  上一页
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy || result.page >= result.totalPages}
                  onClick={() => void fetchResultPage(result.page + 1)}
                >
                  下一页
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy || result.page >= result.totalPages}
                  onClick={() => void fetchResultPage(result.totalPages)}
                >
                  尾页
                </Button>
                <TextField
                  size="small"
                  type="number"
                  label="页码"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      jumpToResultPage()
                    }
                  }}
                  sx={{ width: 96 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy}
                  onClick={jumpToResultPage}
                >
                  跳转
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy}
                  onClick={() =>
                    void fetchResultPage(
                      result.pageSize !== queryPageSize
                        ? 1
                        : result.page,
                    )
                  }
                >
                  应用分页
                </Button>
              </>
            )}
            <Button
              size="small"
              variant="outlined"
              disabled={exportingCsv}
              onClick={() => void exportCurrentResultCsv()}
            >
              {exportingCsv ? '导出中…' : '导出 CSV'}
            </Button>
            <Button size="small" variant="outlined" onClick={() => void copyResultHeaders()}>
              复制表头
            </Button>
            <Button size="small" variant="outlined" onClick={() => void copyResultTsv()}>
              复制 TSV
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void copySelectedResultRows()}
            >
              复制选中行
            </Button>
            <Typography variant="caption" color="text.secondary">
              结果表已切换为网格模式，可排序/筛选/多选；`Ctrl/Cmd + C`
              复制单元格，`Ctrl/Cmd + Shift + C` 复制当前行或多行选中结果
            </Typography>
          </>
        )}
      </Box>

      <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'stretch',
            borderBottom: 1,
            borderColor: 'divider',
            minHeight: 40,
            bgcolor: (t) => t.palette.action.hover,
          }}
        >
          <Box
            component="ul"
            sx={{
              listStyle: 'none',
              m: 0,
              p: 0,
              pl: 0.5,
              display: 'flex',
              flex: 1,
              minWidth: 0,
              overflow: 'auto',
            }}
          >
            {sqlTabs.map((t) => {
              const isActive = t.id === activeTabId
              return (
                <Box
                  component="li"
                  key={t.id}
                  onAuxClick={(e) => {
                    if (e.button !== 1) {
                      return
                    }
                    e.preventDefault()
                    if (activeTabId && editorRef.current) {
                      setTabSql(activeTabId, editorRef.current.getValue())
                    }
                    closeSqlTab(t.id)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setTabMenu({ x: e.clientX, y: e.clientY, tabId: t.id })
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: 2,
                    borderColor: isActive ? 'primary.main' : 'transparent',
                    flexShrink: 0,
                  }}
                >
                  <Button
                    size="small"
                    onClick={() => switchToTab(t.id)}
                    color={isActive ? 'primary' : 'inherit'}
                    sx={{
                      textTransform: 'none',
                      minWidth: 0,
                      maxWidth: 180,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <Typography variant="body2" noWrap>
                      {t.isDirty ? `*${t.title}` : t.title}
                    </Typography>
                  </Button>
                  <Tooltip title="关闭（⌘/Ctrl + Shift + W）">
                    <IconButton
                      size="small"
                      aria-label="关闭标签"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (activeTabId && editorRef.current) {
                          setTabSql(activeTabId, editorRef.current.getValue())
                        }
                        closeSqlTab(t.id)
                      }}
                      sx={{ mr: 0.5 }}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )
            })}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Tooltip title="新建 SQL 标签（⌘/Ctrl + T）">
                <IconButton
                  size="small"
                  aria-label="新建查询"
                  onClick={() => {
                    if (activeTabId && editorRef.current) {
                      setTabSql(activeTabId, editorRef.current.getValue())
                    }
                    addSqlTab()
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Box>

        <Box sx={{ height: 300, minHeight: 200 }}>
          <Editor
            key={activeTabId}
            value={sql}
            onChange={onChange}
            onMount={onMount}
            defaultLanguage="sql"
            theme={colorMode === 'dark' ? 'vs-dark' : 'light'}
            options={{
              fontSize: editorFontSize,
              minimap: { enabled: false },
              wordWrap: 'on',
              automaticLayout: true,
            }}
            height="100%"
          />
        </Box>
      </Paper>

      {infoNotice && (
        <Alert
          severity="info"
          onClose={() => setInfoNotice(null)}
          sx={{ py: 0.5 }}
        >
          {infoNotice}
        </Alert>
      )}

      {err && <Alert severity="error">{err}</Alert>}

      {results.length > 1 && activeTabId && (
        <Paper variant="outlined" sx={{ px: 1 }}>
          <Tabs
            value={activeResultIndex}
            onChange={(_, next) => setActiveResultIndex(activeTabId, Number(next))}
            variant="scrollable"
            scrollButtons="auto"
          >
            {results.map((item, index) => (
              <Tab
                key={item.id}
                label={`结果 ${index + 1} · ${item.rowCount} 行`}
                title={item.sql}
              />
            ))}
          </Tabs>
        </Paper>
      )}

      {result && (
        <Box
          onKeyDownCapture={handleResultKeyDown}
          sx={{
            flex: '1 1 auto',
            minHeight: 180,
            outline: 'none',
          }}
        >
          {colNames.length > 0 ? (
            <Box
              sx={{
                height: 'clamp(260px, 38vh, 420px)',
                minHeight: 220,
                maxHeight: 420,
                width: 1,
              }}
            >
              <AgGridReact<ResultGridRow>
                theme={resultGridTheme}
                rowData={resultRowData}
                columnDefs={resultColDefs}
                defaultColDef={{
                  sortable: true,
                  resizable: true,
                  filter: true,
                }}
                rowSelection="multiple"
                rowMultiSelectWithClick
                suppressCellFocus={false}
                animateRows={false}
                getRowId={(params) => params.data.__rowId}
                onGridReady={(event: GridReadyEvent<ResultGridRow>) => {
                  resultGridApiRef.current = event.api
                }}
                onCellClicked={(event: CellClickedEvent<ResultGridRow>) => {
                  event.node.setSelected(true)
                }}
                onCellContextMenu={(event: CellContextMenuEvent<ResultGridRow>) => {
                  const nativeEvent = event.event
                  if (!(nativeEvent instanceof MouseEvent)) {
                    return
                  }
                  nativeEvent.preventDefault()
                  event.node.setSelected(true)
                  const column = event.colDef.field ?? event.column.getColId()
                  if (!event.data || !column) {
                    return
                  }
                  setResultCellMenu({
                    x: nativeEvent.clientX,
                    y: nativeEvent.clientY,
                    column,
                    row: event.data,
                  })
                }}
                overlayNoRowsTemplate="无行返回（或仅为更新语句）"
              />
            </Box>
          ) : (
            <Paper
              variant="outlined"
              sx={{
                minHeight: 180,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: 2,
              }}
            >
              <Typography color="text.secondary">
                无行返回（或仅为更新语句）
              </Typography>
            </Paper>
          )}
        </Box>
      )}

      <Menu
        open={tabMenu != null}
        onClose={() => setTabMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          tabMenu == null ? undefined : { top: tabMenu.y, left: tabMenu.x }
        }
      >
        <MenuItem
          onClick={() => {
            if (tabMenu) {
              closeSqlTab(tabMenu.tabId)
            }
            setTabMenu(null)
          }}
        >
          关闭当前
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (tabMenu) {
              closeOtherSqlTabs(tabMenu.tabId)
            }
            setTabMenu(null)
          }}
        >
          关闭其他
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeAllSqlTabs()
            setTabMenu(null)
          }}
        >
          关闭全部
        </MenuItem>
      </Menu>
      <Menu
        open={resultCellMenu != null}
        onClose={() => setResultCellMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          resultCellMenu == null
            ? undefined
            : { top: resultCellMenu.y, left: resultCellMenu.x }
        }
      >
        <MenuItem
          onClick={() => {
            if (resultCellMenu) {
              void copyResultCell(resultCellMenu.row, resultCellMenu.column)
            }
            setResultCellMenu(null)
          }}
        >
          复制单元格
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (resultCellMenu) {
              void copyResultRow(resultCellMenu.row)
            }
            setResultCellMenu(null)
          }}
        >
          复制整行
        </MenuItem>
        <MenuItem
          onClick={() => {
            void copySelectedResultRows()
            setResultCellMenu(null)
          }}
        >
          复制选中行
        </MenuItem>
        <MenuItem
          onClick={() => {
            void copyResultHeaders()
            setResultCellMenu(null)
          }}
        >
          复制表头
        </MenuItem>
        <MenuItem
          onClick={() => {
            void copyResultTsv()
            setResultCellMenu(null)
          }}
        >
          复制 TSV
        </MenuItem>
      </Menu>
      <Snackbar
        open={copyNotice != null}
        autoHideDuration={1800}
        onClose={() => setCopyNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setCopyNotice(null)}
          sx={{ width: '100%' }}
        >
          {copyNotice}
        </Alert>
      </Snackbar>
    </Box>
  )
}
