import {
  colorSchemeDark,
  colorSchemeLight,
  themeQuartz,
} from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CellValueChangedEvent, ColDef, GridApi } from 'ag-grid-community'
import type { ApiResult } from '@shared/dto/api-result'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import type { ExplorerNodeDto } from '@shared/dto/explorer'
import type { TableGetStructureData } from '@shared/dto/table'
import { ensureAgGridModules } from '@/lib/agGridSetup'
import { useUIStore } from '@/stores/uiStore'
import { CsvImportDialog } from './CsvImportDialog'

type TabKey = 'structure' | 'data'

const pageSize = 200

function formatCell(v: unknown) {
  if (v == null) {
    return ''
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

function rowIdFromPrimaryKey(
  keys: string[],
  row: Record<string, unknown>,
): string {
  return JSON.stringify(
    Object.fromEntries(keys.map((k) => [k, row[k] ?? null])),
  )
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

function getApiErrorMessage(result: { success: boolean; error?: { message?: string } }) {
  return !result.success && 'error' in result
    ? (result.error?.message ?? '操作失败')
    : '操作失败'
}

function sanitizeRowForCopy(row: Record<string, unknown>) {
  const copy: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('_') || key.startsWith('__')) {
      continue
    }
    copy[key] = value
  }
  return copy
}

export function TableInspectorDialog({
  open,
  onClose,
  connectionId,
  node,
  initialTab = 'structure',
}: {
  open: boolean
  onClose: () => void
  connectionId: string
  node: ExplorerNodeDto
  initialTab?: TabKey
}) {
  const colorMode = useUIStore((s) => s.colorMode)
  const appendExecutionLog = useUIStore((s) => s.appendExecutionLog)
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [err, setErr] = useState<string | null>(null)
  const [toastNotice, setToastNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [structRes, setStructRes] = useState<
    ApiResult<TableGetStructureData> | null
  >(null)
  const [page, setPage] = useState(1)
  const [dataApiRes, setDataApiRes] = useState<Awaited<
    ReturnType<NonNullable<typeof window.electronAPI>['table']['getData']>
  > | null>(null)
  const [gridRowData, setGridRowData] = useState<Record<string, unknown>[]>([])
  const [hiddenColumnNames, setHiddenColumnNames] = useState<string[]>([])
  const [columnMenuAnchor, setColumnMenuAnchor] = useState<HTMLElement | null>(null)
  const [csvImportOpen, setCsvImportOpen] = useState(false)

  const gridApiRef = useRef<GridApi | null>(null)

  const tableName = node.label
  const kind: 'table' | 'view' = node.kind === 'view' ? 'view' : 'table'
  const ref = node.ref

  const showSuccessNotice = useCallback((message: string) => {
    setToastNotice(message)
  }, [])

  const loadStructure = useCallback(async () => {
    const api = window.electronAPI?.table
    if (!api) {
      return
    }
    setErr(null)
    setLoading(true)
    const r = await api.getStructure({
      connectionId,
      table: tableName,
      kind,
      ref,
    })
    setLoading(false)
    setStructRes(r)
    if (!r.success) {
      setErr(getApiErrorMessage(r))
    }
  }, [connectionId, tableName, kind, ref])

  const loadData = useCallback(
    async (p: number) => {
      const api = window.electronAPI?.table
      if (!api) {
        return
      }
      setErr(null)
      setLoading(true)
      const r = await api.getData({
        connectionId,
        table: tableName,
        kind,
        ref,
        page: p,
        pageSize,
      })
      setLoading(false)
      setDataApiRes(r)
      setPage(p)
      if (r.success) {
        const nextColumns = new Set(r.data.columns.map((c) => c.name))
        setHiddenColumnNames((names) => names.filter((name) => nextColumns.has(name)))
        setGridRowData(
          (r.data.rows as Record<string, unknown>[]).map((row, i) => ({
            ...row,
            __rowId: `p${r.data.page}-${i}`,
          })),
        )
      } else {
        setGridRowData([])
      }
      if (!r.success) {
        setErr(getApiErrorMessage(r))
      }
    },
    [connectionId, tableName, kind, ref],
  )

  useEffect(() => {
    if (!open) {
      return
    }
    const t = setTimeout(() => {
      setTab(initialTab)
      setErr(null)
      setStructRes(null)
      setDataApiRes(null)
      setGridRowData([])
      setHiddenColumnNames([])
      setColumnMenuAnchor(null)
      setToastNotice(null)
      setPage(1)
    }, 0)
    return () => clearTimeout(t)
  }, [open, initialTab, tableName, connectionId])

  useEffect(() => {
    if (!open) {
      return
    }
    const t = setTimeout(() => {
      if (tab === 'structure') {
        void loadStructure()
      } else {
        void loadData(1)
      }
    }, 0)
    return () => clearTimeout(t)
  }, [open, tab, loadStructure, loadData])

  useEffect(() => {
    ensureAgGridModules()
  }, [])

  const gridTheme = useMemo(
    () =>
      colorMode === 'dark'
        ? themeQuartz.withPart(colorSchemeDark)
        : themeQuartz.withPart(colorSchemeLight),
    [colorMode],
  )

  const pkNames = useMemo(
    () => (dataApiRes?.success ? dataApiRes.data.primaryKeyColumnNames : []),
    [dataApiRes],
  )
  const pkSet = useMemo(() => new Set(pkNames), [pkNames])
  const canEditData = kind === 'table' && pkNames.length > 0
  const hiddenColumnSet = useMemo(
    () => new Set(hiddenColumnNames),
    [hiddenColumnNames],
  )

  const colDefs: ColDef[] = useMemo(() => {
    if (!dataApiRes?.success) {
      return []
    }
    const d = dataApiRes.data
    if (!d.columns.length) {
      return []
    }
    return d.columns.map((c) => ({
      field: c.name,
      headerName: c.name,
      flex: 1,
      minWidth: 120,
      hide: hiddenColumnSet.has(c.name),
      valueFormatter: (p) => formatCell(p.value),
    }))
  }, [dataApiRes, hiddenColumnSet])

  const dataColumnNames = useMemo(
    () => (dataApiRes?.success ? dataApiRes.data.columns.map((c) => c.name) : []),
    [dataApiRes],
  )
  const visibleColumnCount = dataColumnNames.length - hiddenColumnNames.length

  const toggleColumnVisibility = useCallback(
    (columnName: string) => {
      setHiddenColumnNames((names) => {
        if (names.includes(columnName)) {
          return names.filter((name) => name !== columnName)
        }
        if (dataColumnNames.length - names.length <= 1) {
          return names
        }
        return [...names, columnName]
      })
    },
    [dataColumnNames.length],
  )

  const showAllColumns = useCallback(() => {
    setHiddenColumnNames([])
  }, [])

  const onCellValueChanged = useCallback(
    async (e: CellValueChangedEvent) => {
      const tapi = window.electronAPI?.table
      if (!tapi) {
        return
      }
      if (e.data?._isNew) {
        return
      }
      if (!e.colDef?.field) {
        return
      }
      if (kind === 'view' || !canEditData) {
        return
      }
      if (pkSet.has(e.colDef.field)) {
        e.node.setDataValue(e.colDef.field, e.oldValue)
        return
      }
      if (Object.is(e.newValue, e.oldValue)) {
        return
      }
      const idField = e.colDef.field
      const row = e.data as Record<string, unknown>
      if (
        !window.confirm(
          `确定保存字段「${idField}」的修改？\n\n原值：${formatCell(e.oldValue)}\n新值：${formatCell(e.newValue)}`,
        )
      ) {
        e.node.setDataValue(idField, e.oldValue)
        return
      }
      const primaryKey: Record<string, unknown> = {}
      for (const c of pkNames) {
        primaryKey[c] = row[c]
      }
      setErr(null)
      const r = await tapi.updateRow({
        connectionId,
        table: tableName,
        kind,
        ref,
        primaryKey,
        changes: { [idField]: e.newValue },
      })
      if (!r.success) {
        e.node.setDataValue(e.colDef.field, e.oldValue)
        const message = getApiErrorMessage(r)
        setErr(message)
        appendExecutionLog({
          level: 'error',
          title: `表编辑失败：${tableName}`,
          detail: message,
        })
        return
      }
      if (r.data.affected === 0) {
        e.node.setDataValue(e.colDef.field, e.oldValue)
        setErr('没有行被更新（可能行已被他处修改）')
        appendExecutionLog({
          level: 'warning',
          title: `表编辑未生效：${tableName}`,
          detail: `${idField} 未更新到任何行`,
        })
        return
      }
      appendExecutionLog({
        level: 'success',
        title: `表编辑成功：${tableName}`,
        detail: `${idField} 已更新`,
      })
      showSuccessNotice('已保存单元格修改')
    },
    [
      appendExecutionLog,
      canEditData,
      kind,
      connectionId,
      tableName,
      ref,
      pkNames,
      pkSet,
      showSuccessNotice,
    ],
  )

  const addEmptyRow = useCallback(() => {
    if (!dataApiRes?.success) {
      return
    }
    const cols = dataApiRes.data.columns
    const line: Record<string, unknown> = {
      _isNew: true,
      _tempId: globalThis.crypto?.randomUUID?.() ?? `n-${Date.now()}`,
    }
    for (const c of cols) {
      line[c.name] = ''
    }
    setGridRowData((r) => [...r, line])
  }, [dataApiRes])

  const saveNewRows = useCallback(async () => {
    const tapi = window.electronAPI?.table
    if (!tapi) {
      return
    }
    if (kind === 'view') {
      return
    }
    const toSave = gridRowData.filter((r) => r._isNew)
    if (toSave.length === 0) {
      setErr('没有待保存的新行')
      return
    }
    if (!window.confirm(`确定保存 ${toSave.length} 行新增数据？`)) {
      return
    }
    setErr(null)
    for (const row of toSave) {
      const clean: Record<string, unknown> = { ...row }
      delete (clean as { _isNew?: boolean })._isNew
      delete (clean as { _tempId?: string })._tempId
      for (const k of Object.keys(clean)) {
        if (clean[k] === '') {
          clean[k] = null
        }
      }
      const r = await tapi.insertRow({
        connectionId,
        table: tableName,
        kind,
        ref,
        row: clean,
      })
      if (!r.success) {
        const message = getApiErrorMessage(r)
        setErr(message)
        appendExecutionLog({
          level: 'error',
          title: `新增行失败：${tableName}`,
          detail: message,
        })
        return
      }
    }
    appendExecutionLog({
      level: 'success',
      title: `新增行成功：${tableName}`,
      detail: `已提交 ${toSave.length} 行`,
    })
    showSuccessNotice(`已保存 ${toSave.length} 行新增数据`)
    void loadData(page)
  }, [
    appendExecutionLog,
    kind,
    gridRowData,
    connectionId,
    tableName,
    ref,
    loadData,
    page,
    showSuccessNotice,
  ])

  const deleteSelected = useCallback(async () => {
    const tapi = window.electronAPI?.table
    if (!tapi) {
      return
    }
    if (kind === 'view' || !canEditData) {
      return
    }
    const api = gridApiRef.current
    if (!api) {
      return
    }
    const sel = api.getSelectedRows() as Record<string, unknown>[]
    if (sel.length === 0) {
      setErr('请先在表格中点选一行')
      return
    }
    setErr(null)
    const row = sel[0]
    if (row._isNew) {
      setGridRowData((g) => g.filter((r) => r._tempId !== row._tempId))
      showSuccessNotice('已移除未保存的新行')
      return
    }
    if (!window.confirm('确定从表中删除选中的行？此操作不可撤销。')) {
      return
    }
    const primaryKey: Record<string, unknown> = {}
    for (const c of pkNames) {
      primaryKey[c] = row[c]
    }
    const r = await tapi.deleteRow({
      connectionId,
      table: tableName,
      kind,
      ref,
      primaryKey,
    })
    if (!r.success) {
      const message = getApiErrorMessage(r)
      setErr(message)
      appendExecutionLog({
        level: 'error',
        title: `删除行失败：${tableName}`,
        detail: message,
      })
      return
    }
    appendExecutionLog({
      level: 'warning',
      title: `删除行成功：${tableName}`,
      detail: `已删除 1 行`,
    })
    showSuccessNotice('已删除 1 行')
    void loadData(page)
  }, [
    appendExecutionLog,
    kind,
    canEditData,
    connectionId,
    tableName,
    ref,
    pkNames,
    loadData,
    page,
    showSuccessNotice,
  ])

  const total = dataApiRes?.success ? dataApiRes.data.total : 0
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  const ddl = structRes?.success ? structRes.data.ddl : null
  const columns = structRes?.success ? structRes.data.columns : []
  const indexes = structRes?.success ? structRes.data.indexes : []

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" scroll="paper">
      <DialogTitle>
        {node.kind} · {node.label}
      </DialogTitle>
      <DialogContent dividers>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as TabKey)}
          sx={{ mb: 1 }}
        >
          <Tab value="structure" label="结构" />
          <Tab value="data" label="数据" />
        </Tabs>

        {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
        {loading && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
            加载中…
          </Typography>
        )}

        {tab === 'structure' && (
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {columns.length > 0 && (
              <TableContainer>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>列</TableCell>
                      <TableCell>类型</TableCell>
                      <TableCell>可空</TableCell>
                      <TableCell>键</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {columns.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.dataType}</TableCell>
                        <TableCell>{c.nullable ? 'YES' : 'NO'}</TableCell>
                        <TableCell>{c.key ?? ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {indexes.length > 0 && (
              <TableContainer>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>索引名</TableCell>
                      <TableCell>列</TableCell>
                      <TableCell>唯一</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {indexes.map((idx) => (
                      <TableRow key={idx.name}>
                        <TableCell>{idx.name}</TableCell>
                        <TableCell>{idx.columns.join(', ')}</TableCell>
                        <TableCell>{idx.unique ? 'YES' : 'NO'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {ddl && (
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="subtitle2">DDL / 定义</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={async () => {
                      try {
                        await copyText(ddl)
                        appendExecutionLog({
                          level: 'success',
                          title: `已复制 DDL：${tableName}`,
                        })
                        showSuccessNotice('已复制 DDL')
                      } catch (error) {
                        setErr(error instanceof Error ? error.message : '复制 DDL 失败')
                      }
                    }}
                  >
                    复制 DDL
                  </Button>
                </Box>
                <TextField
                  multiline
                  minRows={6}
                  fullWidth
                  size="small"
                  value={ddl}
                  slotProps={{ input: { readOnly: true } }}
                />
              </Stack>
            )}
            {columns.length === 0 && !loading && !err && !ddl && indexes.length === 0 && (
              <Typography color="text.secondary">暂无列信息</Typography>
            )}
            <Button size="small" onClick={() => void loadStructure()}>
              重新加载
            </Button>
          </Stack>
        )}

        {tab === 'data' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 400 }}>
            {kind === 'table' && pkNames.length === 0 && !loading && dataApiRes?.success && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                此表无明确主键，行内增删改已禁用
              </Alert>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                disabled={page <= 1 || loading}
                onClick={() => void loadData(page - 1)}
              >
                上一页
              </Button>
              <Button
                size="small"
                disabled={page >= maxPage || loading}
                onClick={() => void loadData(page + 1)}
              >
                下一页
              </Button>
              <Typography variant="body2" color="text.secondary">
                第 {page} / {maxPage} 页 · 共 {total} 行 · 每页 {pageSize} 行
                {dataApiRes?.success && dataApiRes.data.durationMs != null
                  ? ` · ${dataApiRes.data.durationMs} ms`
                  : ''}
              </Typography>
              {kind === 'table' && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setCsvImportOpen(true)}
                  disabled={loading}
                >
                  导入 CSV
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                onClick={(event) => setColumnMenuAnchor(event.currentTarget)}
                disabled={loading || dataColumnNames.length === 0}
              >
                列显隐（{visibleColumnCount}/{dataColumnNames.length}）
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  const api = gridApiRef.current
                  const cell = api?.getFocusedCell()
                  if (!api || !cell) {
                    setErr('请先选中一个单元格')
                    return
                  }
                  const rowNode = api.getDisplayedRowAtIndex(cell.rowIndex)
                  const field = cell.column.getColId()
                  const value = rowNode?.data?.[field]
                  try {
                    await copyText(formatCell(value))
                    appendExecutionLog({
                      level: 'success',
                      title: `已复制单元格：${tableName}`,
                      detail: `${field} = ${formatCell(value)}`,
                    })
                    showSuccessNotice('已复制单元格')
                  } catch (error) {
                    setErr(error instanceof Error ? error.message : '复制单元格失败')
                  }
                }}
                disabled={loading || colDefs.length === 0}
              >
                复制单元格
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  const api = gridApiRef.current
                  const rows = api?.getSelectedRows() as Record<string, unknown>[] | undefined
                  const row = rows?.[0]
                  if (!row) {
                    setErr('请先在表格中点选一行')
                    return
                  }
                  try {
                    await copyText(JSON.stringify(sanitizeRowForCopy(row), null, 2))
                    appendExecutionLog({
                      level: 'success',
                      title: `已复制整行：${tableName}`,
                    })
                    showSuccessNotice('已复制整行')
                  } catch (error) {
                    setErr(error instanceof Error ? error.message : '复制整行失败')
                  }
                }}
                disabled={loading || colDefs.length === 0}
              >
                复制整行
              </Button>
              {canEditData && kind === 'table' && (
                <>
                  <Button size="small" variant="outlined" onClick={addEmptyRow} disabled={loading}>
                    新增行
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => void saveNewRows()}
                    disabled={loading}
                  >
                    保存新行
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    onClick={() => void deleteSelected()}
                    disabled={loading}
                  >
                    删除选中
                  </Button>
                </>
              )}
              <Menu
                open={columnMenuAnchor != null}
                anchorEl={columnMenuAnchor}
                onClose={() => setColumnMenuAnchor(null)}
              >
                <MenuItem dense onClick={showAllColumns} disabled={hiddenColumnNames.length === 0}>
                  显示全部列
                </MenuItem>
                {dataColumnNames.map((name) => {
                  const checked = !hiddenColumnSet.has(name)
                  return (
                    <MenuItem
                      key={name}
                      dense
                      onClick={() => toggleColumnVisibility(name)}
                      disabled={checked && visibleColumnCount <= 1}
                    >
                      <FormControlLabel
                        control={<Checkbox size="small" checked={checked} />}
                        label={name}
                        sx={{ m: 0, width: 1 }}
                      />
                    </MenuItem>
                  )
                })}
              </Menu>
            </Box>
            <Box sx={{ flex: 1, minHeight: 360, width: 1 }}>
              {colDefs.length > 0 && (
                <AgGridReact
                  theme={gridTheme}
                  rowData={gridRowData}
                  columnDefs={colDefs}
                  onGridReady={(e) => {
                    gridApiRef.current = e.api
                  }}
                  getRowId={(p) => {
                    const d = p.data
                    if (d._isNew) {
                      return String(d._tempId)
                    }
                    if (pkNames.length > 0) {
                      return rowIdFromPrimaryKey(
                        pkNames,
                        d as Record<string, unknown>,
                      )
                    }
                    return String(
                      (d as Record<string, unknown>).__rowId ?? 'unknown',
                    )
                  }}
                  onCellValueChanged={onCellValueChanged}
                  rowSelection="single"
                  defaultColDef={{
                    sortable: true,
                    resizable: true,
                    editable: (p) => {
                      if (kind === 'view' || !canEditData) {
                        return false
                      }
                      if (p.data?._isNew) {
                        return true
                      }
                      const f = p.colDef.field
                      if (!f) {
                        return false
                      }
                      return !pkSet.has(f)
                    },
                  }}
                />
              )}
              {gridRowData.length === 0 && !loading && colDefs.length === 0 && !err && (
                <Typography color="text.secondary">无数据</Typography>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
      <CsvImportDialog
        open={csvImportOpen}
        onClose={() => setCsvImportOpen(false)}
        onImported={() => {
          void loadData(page)
        }}
        connectionId={connectionId}
        table={tableName}
        kind={kind}
        refInfo={ref}
      />
      <Snackbar
        open={toastNotice != null}
        autoHideDuration={1800}
        onClose={() => setToastNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setToastNotice(null)}
          sx={{ width: '100%' }}
        >
          {toastNotice}
        </Alert>
      </Snackbar>
    </Dialog>
  )
}
