import Papa from 'papaparse'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import type { TableColumnInfo, TableRef } from '@shared/dto/table'
import { useUIStore } from '@/stores/uiStore'

const SKIP_OPTION = '__skip__'
const PREVIEW_ROW_LIMIT = 8
const FAILURE_ROW_LIMIT = 20

type CsvRow = Record<string, string>

type ImportFailure = {
  rowNumber: number
  message: string
  sample: CsvRow
}

function normalizeName(input: string): string {
  return input.trim().toLowerCase()
}

function defaultMapping(
  columns: TableColumnInfo[],
  headers: string[],
): Record<string, string> {
  const exact = new Map(headers.map((h) => [h, h]))
  const normalized = new Map(headers.map((h) => [normalizeName(h), h]))
  return Object.fromEntries(
    columns.map((col) => {
      const byExact = exact.get(col.name)
      if (byExact) {
        return [col.name, byExact]
      }
      const byNormalized = normalized.get(normalizeName(col.name))
      return [col.name, byNormalized ?? SKIP_OPTION]
    }),
  )
}

function isRequiredColumn(column: TableColumnInfo): boolean {
  const extra = column.extra?.toLowerCase() ?? ''
  return !column.nullable && column.defaultValue == null && !extra.includes('auto_increment')
}

export function CsvImportDialog({
  open,
  onClose,
  onImported,
  connectionId,
  table,
  kind,
  refInfo,
}: {
  open: boolean
  onClose: () => void
  onImported?: () => void
  connectionId: string
  table: string
  kind: 'table' | 'view'
  refInfo?: TableRef
}) {
  const appendExecutionLog = useUIStore((s) => s.appendExecutionLog)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [columns, setColumns] = useState<TableColumnInfo[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const [result, setResult] = useState<{
    imported: number
    failures: ImportFailure[]
  } | null>(null)

  const loadStructure = useCallback(async () => {
    const api = window.electronAPI?.table
    if (!api) {
      return
    }
    setLoading(true)
    setError(null)
    const res = await api.getStructure({
      connectionId,
      table,
      kind,
      ref: refInfo,
    })
    setLoading(false)
    if (!res.success) {
      const message = 'error' in res ? res.error.message : '加载目标表结构失败'
      setError(message)
      return
    }
    setColumns(res.data.columns)
  }, [connectionId, kind, refInfo, table])

  useEffect(() => {
    if (!open) {
      return
    }
    const t = setTimeout(() => {
      void loadStructure()
    }, 0)
    return () => clearTimeout(t)
  }, [loadStructure, open])

  useEffect(() => {
    if (open) {
      return
    }
    const t = setTimeout(() => {
      setColumns([])
      setFileName(null)
      setCsvHeaders([])
      setCsvRows([])
      setMapping({})
      setError(null)
      setImporting(false)
      setProgress(null)
      setResult(null)
    }, 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (columns.length === 0 || csvHeaders.length === 0) {
      return
    }
    if (Object.keys(mapping).length > 0) {
      return
    }
    const t = setTimeout(() => {
      setMapping(defaultMapping(columns, csvHeaders))
    }, 0)
    return () => clearTimeout(t)
  }, [columns, csvHeaders, mapping])

  const onSelectFile = useCallback(async (file: File | null) => {
    if (!file) {
      return
    }
    setError(null)
    setResult(null)
    setProgress(null)
    setFileName(file.name)
    const text = await file.text()
    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
    })
    if (parsed.errors.length > 0) {
      setError(parsed.errors[0]?.message ?? 'CSV 解析失败')
      return
    }
    const headers =
      parsed.meta.fields?.map((field) => field.trim()).filter(Boolean) ?? []
    const rows = parsed.data.filter((row) =>
      Object.values(row).some((value) => String(value ?? '').trim() !== ''),
    )
    if (headers.length === 0) {
      setError('未识别到 CSV 表头，请确认首行为字段名')
      return
    }
    setCsvHeaders(headers)
    setCsvRows(rows)
    setMapping(defaultMapping(columns, headers))
  }, [columns])

  const mappedColumnCount = useMemo(
    () => Object.values(mapping).filter((value) => value !== SKIP_OPTION).length,
    [mapping],
  )

  const duplicateMappedHeaders = useMemo(() => {
    const counts = new Map<string, number>()
    for (const value of Object.values(mapping)) {
      if (!value || value === SKIP_OPTION) {
        continue
      }
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([header]) => header)
  }, [mapping])

  const missingRequiredColumns = useMemo(
    () =>
      columns.filter((column) => {
        if (!isRequiredColumn(column)) {
          return false
        }
        const sourceHeader = mapping[column.name]
        return !sourceHeader || sourceHeader === SKIP_OPTION
      }),
    [columns, mapping],
  )

  const previewRows = useMemo(
    () => csvRows.slice(0, PREVIEW_ROW_LIMIT),
    [csvRows],
  )

  const runImport = useCallback(async () => {
    const api = window.electronAPI?.table
    if (!api) {
      return
    }
    if (kind !== 'table') {
      setError('只有数据表支持 CSV 导入')
      return
    }
    if (columns.length === 0) {
      setError('未加载到目标表字段信息')
      return
    }
    if (csvRows.length === 0) {
      setError('请先选择 CSV 文件')
      return
    }
    if (mappedColumnCount === 0) {
      setError('至少映射一个目标字段')
      return
    }
    if (duplicateMappedHeaders.length > 0) {
      setError(`同一个 CSV 列不能重复映射：${duplicateMappedHeaders.join('、')}`)
      return
    }

    setError(null)
    setResult(null)
    setImporting(true)
    setProgress({ done: 0, total: csvRows.length })
    appendExecutionLog({
      level: 'info',
      title: `开始 CSV 导入：${table}`,
      detail: `${fileName ?? '未命名文件'} · ${csvRows.length} 行`,
    })

    let imported = 0
    const failures: ImportFailure[] = []

    try {
      for (let index = 0; index < csvRows.length; index += 1) {
        const sourceRow = csvRows[index] ?? {}
        const row: Record<string, unknown> = {}
        for (const column of columns) {
          const sourceHeader = mapping[column.name]
          if (!sourceHeader || sourceHeader === SKIP_OPTION) {
            continue
          }
          const raw = sourceRow[sourceHeader]
          row[column.name] = raw == null || raw === '' ? null : raw
        }
        if (Object.keys(row).length === 0) {
          failures.push({
            rowNumber: index + 2,
            message: '该行没有可导入的映射字段',
            sample: sourceRow,
          })
          setProgress({ done: index + 1, total: csvRows.length })
          continue
        }

        const res = await api.insertRow({
          connectionId,
          table,
          kind,
          ref: refInfo,
          row,
        })
        if (res.success) {
          imported += res.data.affected
        } else {
          const message = 'error' in res ? res.error.message : '导入失败'
          failures.push({
            rowNumber: index + 2,
            message,
            sample: sourceRow,
          })
        }
        setProgress({ done: index + 1, total: csvRows.length })
      }
    } finally {
      setImporting(false)
    }

    setResult({ imported, failures })
    appendExecutionLog({
      level: failures.length > 0 ? 'warning' : 'success',
      title: `CSV 导入完成：${table}`,
      detail: `成功 ${imported} 行，失败 ${failures.length} 行`,
    })
    onImported?.()
  }, [
    appendExecutionLog,
    columns,
    connectionId,
    csvRows,
    fileName,
    kind,
    mappedColumnCount,
    mapping,
    duplicateMappedHeaders,
    onImported,
    refInfo,
    table,
  ])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>导入 CSV 到 `{table}`</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            当前版本默认要求 CSV 首行为表头；空字符串会按 `NULL` 导入。
          </Alert>

          {duplicateMappedHeaders.length > 0 && (
            <Alert severity="warning" sx={{ py: 0.5 }}>
              检测到重复映射：{duplicateMappedHeaders.join('、')}。开始导入前请确保一个 CSV 列只映射到一个目标字段。
            </Alert>
          )}

          {missingRequiredColumns.length > 0 && (
            <Alert severity="warning" sx={{ py: 0.5 }}>
              以下目标字段看起来是必填，但当前未映射：
              {missingRequiredColumns.map((column) => column.name).join('、')}。继续导入时这些行可能失败。
            </Alert>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          {result && (
            <Alert severity={result.failures.length > 0 ? 'warning' : 'success'}>
              已导入 {result.imported} 行
              {result.failures.length > 0
                ? `，失败 ${result.failures.length} 行`
                : '，未发现失败行'}
            </Alert>
          )}

          {progress && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                导入进度 {progress.done} / {progress.total}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
              />
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
            >
              选择 CSV
            </Button>
            <Typography variant="body2" color="text.secondary">
              {fileName ?? '未选择文件'}
            </Typography>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                void onSelectFile(e.target.files?.[0] ?? null)
                e.currentTarget.value = ''
              }}
            />
          </Box>

          {loading && (
            <Typography variant="body2" color="text.secondary">
              加载目标表结构中…
            </Typography>
          )}

          {columns.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                字段映射
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 1,
                }}
              >
                {columns.map((column) => (
                  <TextField
                    key={column.name}
                    select
                    size="small"
                    label={`${column.name} (${column.dataType})`}
                    value={mapping[column.name] ?? SKIP_OPTION}
                    onChange={(e) =>
                      setMapping((current) => ({
                        ...current,
                        [column.name]: e.target.value,
                      }))
                    }
                    disabled={csvHeaders.length === 0}
                  >
                    <MenuItem value={SKIP_OPTION}>跳过</MenuItem>
                    {csvHeaders.map((header) => (
                      <MenuItem key={header} value={header}>
                        {header}
                      </MenuItem>
                    ))}
                  </TextField>
                ))}
              </Box>
            </Box>
          )}

          {csvHeaders.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                预览（前 {previewRows.length} 行 / 共 {csvRows.length} 行）
              </Typography>
              <TableContainer sx={{ maxHeight: 280 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      {csvHeaders.map((header) => (
                        <TableCell key={header}>{header}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewRows.map((row, index) => (
                      <TableRow key={`${index}-${fileName ?? 'csv'}`}>
                        <TableCell>{index + 2}</TableCell>
                        {csvHeaders.map((header) => (
                          <TableCell key={header}>{String(row[header] ?? '')}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {result && result.failures.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                失败明细（前 {Math.min(result.failures.length, FAILURE_ROW_LIMIT)} 条）
              </Typography>
              <TableContainer sx={{ maxHeight: 260 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>CSV 行号</TableCell>
                      <TableCell>原因</TableCell>
                      <TableCell>样例</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.failures.slice(0, FAILURE_ROW_LIMIT).map((failure) => (
                      <TableRow key={`${failure.rowNumber}-${failure.message}`}>
                        <TableCell>{failure.rowNumber}</TableCell>
                        <TableCell>{failure.message}</TableCell>
                        <TableCell sx={{ whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(failure.sample)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
        <Button
          variant="contained"
          onClick={() => void runImport()}
          disabled={
            loading ||
            csvRows.length === 0 ||
            importing ||
            duplicateMappedHeaders.length > 0
          }
        >
          开始导入
        </Button>
      </DialogActions>
    </Dialog>
  )
}
