import {
  Add,
  DeleteOutlined,
  Edit,
  Link,
  Star,
  StarBorder,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
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
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { ConnectionFormFields, ConnectionRecord } from '@shared/dto/connection'
import { useUIStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const ALL_GROUPS = '__all__'

function groupLabel(group: string | null | undefined): string {
  return group?.trim() || '未分组'
}

function addressLabel(row: ConnectionRecord): string {
  return row.type === 'sqlite'
    ? (row.filePath ?? '')
    : `${row.host ?? ''}:${row.port ?? ''}`
}

function sortConnections(rows: ConnectionRecord[]): ConnectionRecord[] {
  return [...rows].sort((a, b) => {
    if (a.favorite !== b.favorite) {
      return a.favorite ? -1 : 1
    }
    const ga = groupLabel(a.group)
    const gb = groupLabel(b.group)
    const byGroup = ga.localeCompare(gb, 'zh-Hans-CN')
    if (byGroup !== 0) {
      return byGroup
    }
    return a.name.localeCompare(b.name, 'zh-Hans-CN')
  })
}

function defaultForm(): ConnectionFormFields {
  return {
    name: '',
    type: 'mysql',
    favorite: false,
    group: '',
    host: '127.0.0.1',
    port: '3306',
    user: 'root',
    password: '',
    database: '',
    filePath: '',
  }
}

function recordToForm(r: ConnectionRecord): ConnectionFormFields {
  return {
    name: r.name,
    type: r.type,
    favorite: r.favorite,
    group: r.group ?? '',
    host: r.host ?? '',
    port:
      r.type === 'mysql'
        ? String(r.port ?? 3306)
        : r.type === 'postgres'
          ? String(r.port ?? 5432)
          : '',
    user: r.user ?? '',
    password: '',
    database: r.database ?? '',
    filePath: r.filePath ?? '',
  }
}

export function ConnectionManager() {
  const bumpConnectionList = useWorkspaceStore((s) => s.bumpConnectionList)
  const appendExecutionLog = useUIStore((s) => s.appendExecutionLog)
  const api = window.electronAPI?.connections
  const [rows, setRows] = useState<ConnectionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ConnectionFormFields>(defaultForm)
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState(ALL_GROUPS)

  const load = useCallback(async () => {
    if (!api) {
      return
    }
    setLoading(true)
    setError(null)
    const r = await api.list()
    setLoading(false)
    if (!r.success) {
      setError(r.error.message)
      return
    }
    setRows(r.data.connections)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => {
      void load()
    }, 0)
    return () => {
      clearTimeout(t)
    }
  }, [load])

  const openCreate = () => {
    setEditingId(null)
    setForm(defaultForm())
    setBanner(null)
    setDialogOpen(true)
  }

  const openEdit = (rec: ConnectionRecord) => {
    setEditingId(rec.id)
    setForm(recordToForm(rec))
    setBanner(null)
    setDialogOpen(true)
  }

  const save = async () => {
    if (!api) {
      return
    }
    setError(null)
    if (editingId) {
      const r = await api.update({ id: editingId, fields: form })
      if (!r.success) {
        setError(r.error.message)
        return
      }
    } else {
      const r = await api.create({ fields: form })
      if (!r.success) {
        setError(r.error.message)
        return
      }
    }
    setDialogOpen(false)
    bumpConnectionList()
    void load()
  }

  const remove = async (id: string) => {
    if (!api || !window.confirm('确定删除该连接？')) {
      return
    }
    const r = await api.remove({ id })
    if (!r.success) {
      setError(r.error.message)
      appendExecutionLog({
        level: 'error',
        title: '删除连接失败',
        detail: r.error.message,
      })
      return
    }
    appendExecutionLog({
      level: 'warning',
      title: '已删除连接',
      detail: id,
    })
    bumpConnectionList()
    void load()
  }

  const toggleFavorite = async (row: ConnectionRecord) => {
    if (!api) {
      return
    }
    setError(null)
    const fields = {
      ...recordToForm(row),
      favorite: !row.favorite,
    }
    const r = await api.update({ id: row.id, fields })
    if (!r.success) {
      setError(r.error.message)
      return
    }
    bumpConnectionList()
    void load()
  }

  const testSaved = async (id: string) => {
    if (!api) {
      return
    }
    setError(null)
    setBanner(null)
    const r = await api.test({ kind: 'saved', id })
    if (!r.success) {
      setError(r.error.message)
      appendExecutionLog({
        level: 'error',
        title: '连接测试失败',
        detail: r.error.message,
      })
      return
    }
    setBanner('连接测试成功')
    appendExecutionLog({
      level: 'success',
      title: '连接测试成功',
      detail: id,
    })
  }

  const testDraft = async () => {
    if (!api) {
      return
    }
    setError(null)
    setBanner(null)
    const r = await api.test({ kind: 'draft', fields: form })
    if (!r.success) {
      setError(r.error.message)
      appendExecutionLog({
        level: 'error',
        title: '草稿连接测试失败',
        detail: r.error.message,
      })
      return
    }
    setBanner('连接测试成功')
    appendExecutionLog({
      level: 'success',
      title: '草稿连接测试成功',
      detail: form.name || form.host || form.filePath || form.type,
    })
  }

  const pickSqlite = async () => {
    if (!api) {
      return
    }
    const r = await api.pickSqliteFile()
    if (!r.success) {
      setError(r.error.message)
      return
    }
    const filePath = r.data?.path
    if (filePath) {
      setForm((f) => ({ ...f, filePath }))
    }
  }

  const groups = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => groupLabel(row.group)))).sort((a, b) =>
        a.localeCompare(b, 'zh-Hans-CN'),
      ),
    [rows],
  )

  const visibleRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return sortConnections(rows).filter((row) => {
      if (groupFilter !== ALL_GROUPS && groupLabel(row.group) !== groupFilter) {
        return false
      }
      if (!keyword) {
        return true
      }
      return [
        row.name,
        row.type,
        row.group ?? '',
        row.host ?? '',
        row.database ?? '',
        row.filePath ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  }, [groupFilter, rows, search])

  const groupedRows = useMemo(() => {
    const map = new Map<string, ConnectionRecord[]>()
    for (const row of visibleRows) {
      const key = groupLabel(row.group)
      map.set(key, [...(map.get(key) ?? []), row])
    }
    return Array.from(map.entries())
  }, [visibleRows])

  if (!window.electronAPI) {
    return (
      <Alert severity="warning">
        连接管理需在 Electron 中运行（请执行 <code>pnpm dev</code>）。
      </Alert>
    )
  }

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
          连接管理
        </Typography>
        <Button
          size="small"
          variant="contained"
          startIcon={<Add />}
          onClick={openCreate}
        >
          新建连接
        </Button>
        <Button size="small" onClick={() => void load()} disabled={loading}>
          刷新
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="搜索连接"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220, flex: 1 }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="conn-group-filter">分组</InputLabel>
          <Select
            labelId="conn-group-filter"
            label="分组"
            value={groupFilter}
            onChange={(e) => setGroupFilter(String(e.target.value))}
          >
            <MenuItem value={ALL_GROUPS}>全部分组</MenuItem>
            {groups.map((group) => (
              <MenuItem key={group} value={group}>
                {group}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {banner && <Alert severity="success" onClose={() => setBanner(null)}>{banner}</Alert>}
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={64}>收藏</TableCell>
              <TableCell>名称</TableCell>
              <TableCell>分组</TableCell>
              <TableCell>类型</TableCell>
              <TableCell>地址 / 文件</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary">
                    暂无连接，点击「新建连接」添加。
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.length > 0 && visibleRows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary">
                    没有匹配当前筛选条件的连接。
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {groupedRows.map(([group, items]) => (
              <Fragment key={group}>
                <TableRow>
                  <TableCell colSpan={6} sx={{ bgcolor: 'action.hover' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {group} · {items.length} 个连接
                    </Typography>
                  </TableCell>
                </TableRow>
                {items.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <IconButton
                        size="small"
                        color={row.favorite ? 'warning' : 'default'}
                        aria-label={row.favorite ? '取消收藏' : '收藏连接'}
                        onClick={() => void toggleFavorite(row)}
                      >
                        {row.favorite ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      {row.favorite ? '★ ' : ''}
                      {row.name}
                    </TableCell>
                    <TableCell>{groupLabel(row.group)}</TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>{addressLabel(row)}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<Link />}
                        onClick={() => void testSaved(row.id)}
                      >
                        测试
                      </Button>
                      <Button
                        size="small"
                        startIcon={<Edit />}
                        onClick={() => openEdit(row)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteOutlined />}
                        onClick={() => void remove(row.id)}
                      >
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{editingId ? '编辑连接' : '新建连接'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {banner && <Alert severity="success">{banner}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="连接名称"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="分组"
              value={form.group}
              onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
              fullWidth
              helperText="可选；留空则归入“未分组”"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.favorite}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, favorite: e.target.checked }))
                  }
                />
              }
              label="收藏此连接"
            />
            <FormControl fullWidth>
              <InputLabel id="db-type-label">类型</InputLabel>
              <Select
                labelId="db-type-label"
                label="类型"
                value={form.type}
                onChange={(e) => {
                  const t = e.target.value as ConnectionFormFields['type']
                  setForm((f) => ({
                    ...f,
                    type: t,
                    port: t === 'mysql' ? '3306' : t === 'postgres' ? '5432' : '',
                    host: t === 'sqlite' ? '' : f.host,
                    user: t === 'sqlite' ? '' : f.user,
                    database: t === 'sqlite' ? '' : f.database,
                    filePath: t === 'sqlite' ? f.filePath : '',
                  }))
                }}
              >
                <MenuItem value="mysql">MySQL</MenuItem>
                <MenuItem value="postgres">PostgreSQL</MenuItem>
                <MenuItem value="sqlite">SQLite</MenuItem>
              </Select>
            </FormControl>

            {form.type === 'sqlite' ? (
              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                }}
              >
                <TextField
                  label="数据库文件"
                  value={form.filePath}
                  onChange={(e) => setForm((f) => ({ ...f, filePath: e.target.value }))}
                  fullWidth
                />
                <Button variant="outlined" onClick={() => void pickSqlite()} sx={{ mt: 0.5 }}>
                  浏览
                </Button>
              </Box>
            ) : (
              <>
                <TextField
                  label="主机"
                  value={form.host}
                  onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                  fullWidth
                />
                <TextField
                  label="端口"
                  value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                  fullWidth
                />
                <TextField
                  label="用户名"
                  value={form.user}
                  onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
                  fullWidth
                />
                <TextField
                  label="密码"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  fullWidth
                  helperText={editingId ? '留空表示不修改已保存的密码' : undefined}
                />
                <TextField
                  label="数据库名"
                  value={form.database}
                  onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))}
                  fullWidth
                />
              </>
            )}
            <Button variant="outlined" onClick={() => void testDraft()}>
              测试连接（使用当前表单）
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={() => void save()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
