import { createTheme } from '@mui/material'

export function createAppTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: { mode },
    typography: {
      fontFamily: `"Inter", "Segoe UI", "PingFang SC", system-ui, sans-serif`,
    },
  })
}
