import { Box, Typography } from '@mui/material'
import { ExecutionLogPanel } from '@/features/sql/ExecutionLogPanel'
import { SqlWorkbench } from '@/features/sql/SqlWorkbench'

export function WorkbenchPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: 1,
        gap: 1,
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 600, flexShrink: 0 }}>
        SQL 工作台
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <SqlWorkbench />
      </Box>
      <ExecutionLogPanel />
    </Box>
  )
}
