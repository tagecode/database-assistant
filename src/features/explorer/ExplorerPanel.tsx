import type { ConnectionRecord } from '@shared/dto/connection'
import type { ExplorerNodeDto } from '@shared/dto/explorer'
import type { QueryContext } from '@shared/dto/query'
import { ExpandMore } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  FormControl,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useCallback, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { TableInspectorDialog } from '@/features/table/TableInspectorDialog'
import { useWorkspaceStore } from '@/stores/workspaceStore'

type CacheMap = Record<string, ExplorerNodeDto[] | 'loading'>

const rootK = 'root' as const

function explorerGroupLabel(group: string | null | undefined): string {
  return group?.trim() || '未分组'
}

function sortConnections(rows: ConnectionRecord[]): ConnectionRecord[] {
  return [...rows].sort((a, b) => {
    if (a.favorite !== b.favorite) {
      return a.favorite ? -1 : 1
    }
    const ga = explorerGroupLabel(a.group)
    const gb = explorerGroupLabel(b.group)
    const byGroup = ga.localeCompare(gb, 'zh-Hans-CN')
    if (byGroup !== 0) {
      return byGroup
    }
    return a.name.localeCompare(b.name, 'zh-Hans-CN')
  })
}

function cacheKey(parentKey: string | null) {
  return parentKey === null ? rootK : parentKey
}

function buildSelectSql(n: ExplorerNodeDto) {
  const t = n.label
  // 不再拼接 database/schema 前缀，通过 queryContext 机制自动设置默认数据库
  if (n.ref?.database) {
    const tb = t.replaceAll('`', '``')
    return `SELECT * FROM \`${tb}\` LIMIT 200;`
  }
  if (n.ref?.schema) {
    const tb = t.replaceAll('"', '""')
    return `SELECT * FROM "${tb}" LIMIT 200;`
  }
  const esc = t.replaceAll('"', '""')
  return `SELECT * FROM "${esc}" LIMIT 200;`
}

function queryContextFromNode(node: ExplorerNodeDto): QueryContext | null {
  if (node.kind === 'database') {
    return { database: node.label }
  }
  if (node.kind === 'schema') {
    return { schema: node.label }
  }
  if (node.ref?.database) {
    return { database: node.ref.database }
  }
  if (node.ref?.schema) {
    return { schema: node.ref.schema }
  }
  return null
}

function ExplorerRow({
  node,
  depth,
  cache,
  expanded,
  selectedNodeId,
  onToggle,
  onSelect,
  onTableDbl,
  onNodeContext,
}: {
  node: ExplorerNodeDto
  depth: number
  cache: CacheMap
  expanded: Record<string, boolean>
  selectedNodeId: string | null
  onToggle: (n: ExplorerNodeDto) => void
  onSelect: (n: ExplorerNodeDto) => void
  onTableDbl: (n: ExplorerNodeDto) => void
  onNodeContext?: (e: MouseEvent, n: ExplorerNodeDto) => void
}) {
  const open = !!expanded[node.id]
  const sub = cache[node.id]
  const loading = sub === 'loading'
  const selected = selectedNodeId === node.id
  return (
    <Box>
      <ListItemButton
        selected={selected}
        sx={{
          pl: 1.5 + depth * 1.5,
          py: 0.35,
          borderRadius: 1,
          border: 1,
          borderLeftWidth: selected ? 4 : 1,
          borderColor: 'transparent',
          mb: 0.25,
          transition: (t) =>
            t.transitions.create(['background-color', 'border-color', 'box-shadow'], {
              duration: 120,
            }),
          '&.Mui-selected': {
            bgcolor: (t) => alpha(t.palette.primary.main, 0.14),
            borderColor: 'primary.main',
            boxShadow: (t) => `inset 0 0 0 1px ${alpha(t.palette.primary.main, 0.12)}`,
            color: 'primary.main',
            '&:hover': {
              bgcolor: (t) => alpha(t.palette.primary.main, 0.2),
            },
            '& .MuiListItemText-primary': {
              fontWeight: 700,
            },
            '& .MuiListItemText-secondary': {
              color: 'primary.main',
              opacity: 0.85,
            },
          },
          '&:hover': {
            bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
          },
        }}
        onClick={() => {
          onSelect(node)
          if (node.hasChildren) {
            onToggle(node)
          }
        }}
        onContextMenu={(e) => {
          onSelect(node)
          onNodeContext?.(e, node)
        }}
        onDoubleClick={() => {
          onSelect(node)
          if (node.kind === 'table' || node.kind === 'view') {
            onTableDbl(node)
          }
        }}
      >
        {node.hasChildren && (
          <ExpandMore
            sx={{
              fontSize: 20,
              mr: 0.5,
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: (t) =>
                t.transitions.create('transform', { duration: 150 }),
            }}
          />
        )}
        <ListItemText
          primary={node.label}
          secondary={node.kind}
          slotProps={{
            primary: { variant: 'body2' },
            secondary: { variant: 'caption' },
          }}
        />
        {loading && <CircularProgress size={16} sx={{ ml: 1 }} />}
      </ListItemButton>
      {node.hasChildren && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List disablePadding>
            {Array.isArray(sub)
              ? sub.map((c) => (
                  <ExplorerRow
                    key={c.id}
                    node={c}
                    depth={depth + 1}
                    cache={cache}
                    expanded={expanded}
                    selectedNodeId={selectedNodeId}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    onTableDbl={onTableDbl}
                    onNodeContext={onNodeContext}
                  />
                ))
              : null}
          </List>
        </Collapse>
      )}
    </Box>
  )
}

export function ExplorerPanel() {
  const api = window.electronAPI
  const listVersion = useWorkspaceStore((s) => s.connectionListVersion)
  const selectedId = useWorkspaceStore((s) => s.selectedConnectionId)
  const setSelectedId = useWorkspaceStore(
    (s) => s.setSelectedConnectionId,
  )
  const setSelectedQueryContext = useWorkspaceStore(
    (s) => s.setSelectedQueryContext,
  )
  const openQueryFromExplorer = useWorkspaceStore(
    (s) => s.openQueryFromExplorer,
  )

  const [conns, setConns] = useState<ConnectionRecord[]>([])
  const [cache, setCache] = useState<CacheMap>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeLabel, setSelectedNodeLabel] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ctx, setCtx] = useState<{
    x: number
    y: number
    node: ExplorerNodeDto
  } | null>(null)
  const [inspect, setInspect] = useState<{
    node: ExplorerNodeDto
    tab: 'structure' | 'data'
  } | null>(null)

  const loadConns = useCallback(async () => {
    if (!api) {
      return
    }
    const r = await api.connections.list()
    if (!r.success) {
      setError('error' in r ? r.error.message : '加载连接失败')
      return
    }
    setConns(sortConnections(r.data.connections))
    const st = useWorkspaceStore.getState()
    const next = r.data.connections
    let sel = st.selectedConnectionId
    if (!sel || !next.some((c) => c.id === sel)) {
      sel = next[0]?.id ?? null
    }
    st.setSelectedConnectionId(sel)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => {
      void loadConns()
    }, 0)
    return () => clearTimeout(t)
  }, [loadConns, listVersion])

  const loadChildren = useCallback(
    async (parentKey: string | null) => {
      if (!api || !selectedId) {
        return
      }
      const k = cacheKey(parentKey)
      setCache((c) => ({ ...c, [k]: 'loading' }))
      const r = await api.explorer.loadChildren({
        connectionId: selectedId,
        parentKey,
      })
      if (!r.success) {
        setError('error' in r ? r.error.message : '加载对象树失败')
        setCache((c) => {
          const n = { ...c }
          delete n[k]
          return n
        })
        return
      }
      setCache((c) => ({ ...c, [k]: r.data.nodes }))
    },
    [api, selectedId],
  )

  useEffect(() => {
    if (!api || !selectedId) {
      return
    }
    void Promise.resolve().then(() => {
      setError(null)
      setCache({})
      setExpanded({})
      setSelectedNodeId(null)
      setSelectedNodeLabel(null)
      setSelectedQueryContext(null)
      void loadChildren(null)
    })
  }, [api, selectedId, listVersion, loadChildren, setSelectedQueryContext])

  const onToggle = useCallback(
    async (n: ExplorerNodeDto) => {
      if (!n.hasChildren) {
        return
      }
      if (expanded[n.id]) {
        setExpanded((e) => ({ ...e, [n.id]: false }))
        return
      }
      if (cache[n.id] == null) {
        await loadChildren(n.id)
      }
      setExpanded((e) => ({ ...e, [n.id]: true }))
    },
    [cache, expanded, loadChildren],
  )

  const onTableDbl = useCallback(
    (n: ExplorerNodeDto) => {
      setSelectedNodeId(n.id)
      setSelectedNodeLabel(`${n.kind} · ${n.label}`)
      const queryContext = queryContextFromNode(n)
      setSelectedQueryContext(queryContext)
      const sql = buildSelectSql(n) + '\n'
      openQueryFromExplorer(sql, n.label, queryContext)
    },
    [openQueryFromExplorer, setSelectedQueryContext],
  )

  const onNodeContext = useCallback(
    (e: MouseEvent, n: ExplorerNodeDto) => {
      if (n.kind !== 'table' && n.kind !== 'view') {
        return
      }
      e.preventDefault()
      setSelectedNodeId(n.id)
      setSelectedNodeLabel(`${n.kind} · ${n.label}`)
      setSelectedQueryContext(queryContextFromNode(n))
      setCtx({ x: e.clientX, y: e.clientY, node: n })
    },
    [setSelectedQueryContext],
  )

  if (!api) {
    return (
      <Alert severity="warning" sx={{ m: 1 }}>
        对象树需 Electron
      </Alert>
    )
  }

  const rootNodes = cache[rootK]
  const visibleRoot =
    rootNodes && Array.isArray(rootNodes) && filter.trim()
      ? rootNodes.filter((n) =>
          n.label.toLowerCase().includes(filter.trim().toLowerCase()),
        )
      : rootNodes

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: 1,
        width: 1,
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
        对象树
      </Typography>
      <FormControl size="small" fullWidth sx={{ mb: 1 }}>
        <InputLabel id="ep-conn">当前连接</InputLabel>
        <Select
          labelId="ep-conn"
          label="当前连接"
          value={selectedId ?? ''}
          onChange={(e) => {
            const v = e.target.value
            setSelectedId(v ? String(v) : null)
          }}
        >
          {conns.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.favorite ? '★ ' : ''}
              [{explorerGroupLabel(c.group)}] {c.name} ({c.type})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        size="small"
        fullWidth
        label="过滤（根层）"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        sx={{ mb: 1 }}
      />
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 0.5,
        }}
      >
        <Button
          size="small"
          onClick={() => {
            if (!selectedId) {
              return
            }
            setCache({})
            setExpanded({})
            setSelectedNodeId(null)
            setSelectedNodeLabel(null)
            setSelectedQueryContext(null)
            void loadChildren(null)
          }}
        >
          刷新树
        </Button>
      </Box>
      <List
        dense
        disablePadding
        sx={{
          flex: 1,
          minHeight: 200,
          overflow: 'auto',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          p: 0.5,
        }}
      >
        {!selectedId && (
          <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
            请先在「连接管理」中保存连接
          </Typography>
        )}
        {rootNodes === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {Array.isArray(visibleRoot) &&
          visibleRoot.map((n) => (
            <ExplorerRow
              key={n.id}
              node={n}
              depth={0}
              cache={cache}
              expanded={expanded}
              selectedNodeId={selectedNodeId}
              onToggle={onToggle}
              onSelect={(node) => {
                setSelectedNodeId(node.id)
                setSelectedNodeLabel(`${node.kind} · ${node.label}`)
                setSelectedQueryContext(queryContextFromNode(node))
              }}
              onTableDbl={onTableDbl}
              onNodeContext={onNodeContext}
            />
          ))}
      </List>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
        {selectedNodeLabel
          ? `当前选中：${selectedNodeLabel}`
          : '双击或右键表/视图：写 SELECT 或查结构/数据'}
      </Typography>

      <Menu
        open={ctx != null}
        onClose={() => setCtx(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          ctx == null ? undefined : { top: ctx.y, left: ctx.x }
        }
      >
        <MenuItem
          onClick={() => {
            if (ctx) {
              const n = ctx.node
              setSelectedNodeId(n.id)
              setSelectedNodeLabel(`${n.kind} · ${n.label}`)
              const queryContext = queryContextFromNode(n)
              setSelectedQueryContext(queryContext)
              const sql = buildSelectSql(n) + '\n'
              openQueryFromExplorer(sql, n.label, queryContext)
            }
            setCtx(null)
          }}
        >
          新建查询
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (ctx) {
              setSelectedNodeId(ctx.node.id)
              setSelectedNodeLabel(`${ctx.node.kind} · ${ctx.node.label}`)
              setSelectedQueryContext(queryContextFromNode(ctx.node))
              setInspect({ node: ctx.node, tab: 'structure' })
            }
            setCtx(null)
          }}
        >
          查看结构
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (ctx) {
              setSelectedNodeId(ctx.node.id)
              setSelectedNodeLabel(`${ctx.node.kind} · ${ctx.node.label}`)
              setSelectedQueryContext(queryContextFromNode(ctx.node))
              setInspect({ node: ctx.node, tab: 'data' })
            }
            setCtx(null)
          }}
        >
          查看数据
        </MenuItem>
      </Menu>

      {inspect && selectedId && (
        <TableInspectorDialog
          open
          onClose={() => setInspect(null)}
          connectionId={selectedId}
          node={inspect.node}
          initialTab={inspect.tab}
        />
      )}
    </Box>
  )
}
