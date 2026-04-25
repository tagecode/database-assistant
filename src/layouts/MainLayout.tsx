import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  Dialog,
  Drawer,
  IconButton,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { ConnectionManager } from '@/features/connections/ConnectionManager'
import { ExplorerPanel } from '@/features/explorer/ExplorerPanel'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { useUIStore } from '@/stores/uiStore'

const drawerWidth = 300

export function MainLayout({ children }: { children: ReactNode }) {
  const { colorMode, toggleColorMode } = useUIStore()
  const isDark = colorMode === 'dark'
  const [connOpen, setConnOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar variant="dense">
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontWeight: 600 }}>
            BIU Database
          </Typography>
          <Tooltip title={isDark ? '切换为浅色' : '切换为深色'}>
            <IconButton
              color="inherit"
              onClick={toggleColorMode}
              aria-label="切换主题"
            >
              {isDark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="设置">
            <IconButton
              color="inherit"
              onClick={() => setSettingsOpen(true)}
              aria-label="打开设置"
            >
              <SettingsOutlinedIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            borderRight: 1,
            borderColor: 'divider',
            pt: 1.5,
            px: 1.5,
            pb: 1,
            mt: 7,
            bgcolor: 'background.default',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            height: 'calc(100dvh - 56px)',
          },
        }}
        open
      >
        <Button
          fullWidth
          size="small"
          variant="outlined"
          startIcon={<SettingsOutlinedIcon />}
          onClick={() => setConnOpen(true)}
          sx={{ mb: 1, flexShrink: 0 }}
        >
          连接管理
        </Button>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ExplorerPanel />
        </Box>
      </Drawer>

      <Dialog
        open={connOpen}
        onClose={() => setConnOpen(false)}
        fullWidth
        maxWidth="md"
        scroll="paper"
      >
        <Box sx={{ p: 2, pt: 3 }}>
          <ConnectionManager />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Button onClick={() => setConnOpen(false)}>关闭</Button>
          </Box>
        </Box>
      </Dialog>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <Toolbar />
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
