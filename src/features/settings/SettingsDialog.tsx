import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useUIStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const {
    colorMode,
    editorFontSize,
    defaultQueryPageSize,
    queryTimeoutMs,
    setColorMode,
    setEditorFontSize,
    setDefaultQueryPageSize,
    setQueryTimeoutMs,
    appendExecutionLog,
  } = useUIStore()
  const activeTabId = useWorkspaceStore((s) => s.activeTabId)
  const setTabQueryPageSize = useWorkspaceStore((s) => s.setTabQueryPageSize)

  const applyPageSizeToActiveTab = () => {
    if (!activeTabId) {
      return
    }
    setTabQueryPageSize(activeTabId, defaultQueryPageSize)
    appendExecutionLog({
      level: 'info',
      title: '已应用默认分页行数',
      detail: `当前 SQL 标签页每页 ${defaultQueryPageSize} 行`,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>设置</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="settings-color-mode-label">主题</InputLabel>
            <Select
              labelId="settings-color-mode-label"
              label="主题"
              value={colorMode}
              onChange={(event) => setColorMode(event.target.value as 'light' | 'dark')}
            >
              <MenuItem value="light">浅色</MenuItem>
              <MenuItem value="dark">深色</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            type="number"
            label="编辑器字体大小"
            value={editorFontSize}
            onChange={(event) =>
              setEditorFontSize(parseInt(event.target.value, 10) || editorFontSize)
            }
            slotProps={{ htmlInput: { min: 10, max: 28 } }}
            helperText="作用于 SQL 编辑器。"
            fullWidth
          />

          <TextField
            size="small"
            type="number"
            label="查询超时（秒）"
            value={Math.round(queryTimeoutMs / 1000)}
            onChange={(event) =>
              setQueryTimeoutMs(
                Math.max(1, parseInt(event.target.value, 10) || 1) * 1000,
              )
            }
            slotProps={{ htmlInput: { min: 1, max: 600 } }}
            helperText="MySQL/PostgreSQL 查询超时后会自动发起取消；SQLite 同步执行时可能无法立即中断。"
            fullWidth
          />

          <Box>
            <TextField
              size="small"
              type="number"
              label="默认分页行数"
              value={defaultQueryPageSize}
              onChange={(event) =>
                setDefaultQueryPageSize(
                  parseInt(event.target.value, 10) || defaultQueryPageSize,
                )
              }
              slotProps={{ htmlInput: { min: 1, max: 10000 } }}
              helperText="用于新建 SQL 标签页；当前标签可在工作台中单独调整。"
              fullWidth
            />
            <Button
              size="small"
              variant="outlined"
              onClick={applyPageSizeToActiveTab}
              disabled={!activeTabId}
              sx={{ mt: 1 }}
            >
              应用到当前 SQL 标签
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary">
            设置会保存在本机，下次启动自动恢复。
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  )
}
