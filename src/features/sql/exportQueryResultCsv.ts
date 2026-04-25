import type { QueryExecuteData } from '@shared/dto/query'

function escapeCsvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** 浏览器本地下载 CSV（UTF-8 BOM，便于 Excel 打开） */
export function exportQueryResultToCsv(data: QueryExecuteData): void {
  const keys =
    data.columns.length > 0
      ? data.columns.map((c) => c.name)
      : Object.keys(data.rows[0] ?? {})
  const header = keys.map((k) => escapeCsvCell(k)).join(',')
  const lines = data.rows.map((row) =>
    keys.map((k) => escapeCsvCell(row[k])).join(','),
  )
  const bom = '\uFEFF'
  const blob = new Blob([bom + header + '\n' + lines.join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `query-result-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
