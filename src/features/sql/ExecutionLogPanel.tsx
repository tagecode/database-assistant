import {
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Typography,
} from '@mui/material'
import { useMemo } from 'react'
import { useUIStore } from '@/stores/uiStore'

function levelColor(level: 'info' | 'success' | 'warning' | 'error') {
  if (level === 'success') {
    return 'success'
  }
  if (level === 'warning') {
    return 'warning'
  }
  if (level === 'error') {
    return 'error'
  }
  return 'default'
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString()
}

export function ExecutionLogPanel() {
  const {
    executionLogs,
    executionLogUnreadCount,
    executionLogPanelOpen,
    setExecutionLogPanelOpen,
    clearExecutionLogs,
  } = useUIStore()

  const title = useMemo(
    () =>
      executionLogs.length > 0
        ? `执行日志（${executionLogs.length}）`
        : '执行日志',
    [executionLogs.length],
  )

  return (
    <Paper variant="outlined" sx={{ mt: 1, flexShrink: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          borderBottom: executionLogPanelOpen ? 1 : 0,
          borderColor: 'divider',
        }}
      >
        <Badge
          color="error"
          badgeContent={executionLogUnreadCount}
          invisible={executionLogUnreadCount <= 0}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        </Badge>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          onClick={() => setExecutionLogPanelOpen(!executionLogPanelOpen)}
        >
          {executionLogPanelOpen ? '收起' : '展开'}
        </Button>
        <Button
          size="small"
          color="inherit"
          onClick={() => clearExecutionLogs()}
          disabled={executionLogs.length === 0}
        >
          清空
        </Button>
      </Box>

      {executionLogPanelOpen && (
        <Box
          sx={{
            maxHeight: 220,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {executionLogs.length === 0 ? (
            <Typography color="text.secondary" sx={{ px: 1.5, py: 2 }}>
              暂无执行日志
            </Typography>
          ) : (
            executionLogs.map((item, index) => (
              <Box key={item.id}>
                <Box sx={{ px: 1.5, py: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      flexWrap: 'wrap',
                      mb: item.detail ? 0.5 : 0,
                    }}
                  >
                    <Chip
                      size="small"
                      label={item.level}
                      color={levelColor(item.level)}
                      variant="outlined"
                    />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {item.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatTime(item.time)}
                    </Typography>
                  </Box>
                  {item.detail && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ whiteSpace: 'pre-wrap' }}
                    >
                      {item.detail}
                    </Typography>
                  )}
                </Box>
                {index < executionLogs.length - 1 && <Divider />}
              </Box>
            ))
          )}
        </Box>
      )}
    </Paper>
  )
}
