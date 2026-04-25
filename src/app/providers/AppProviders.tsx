import { CssBaseline, ThemeProvider } from '@mui/material'
import { useEffect, useMemo, type ReactNode } from 'react'
import { createAppTheme } from '@/theme/theme'
import { useUIStore } from '@/stores/uiStore'

function toLogDetails(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  return value
}

export function AppProviders({ children }: { children: ReactNode }) {
  const colorMode = useUIStore((s) => s.colorMode)
  const theme = useMemo(() => createAppTheme(colorMode), [colorMode])

  useEffect(() => {
    const appendLog = window.electronAPI?.appLog?.append
    if (!appendLog) {
      return
    }

    const handleError = (event: ErrorEvent) => {
      void appendLog({
        level: 'error',
        source: 'renderer',
        scope: 'window.error',
        message: event.message,
        details: toLogDetails(event.error),
      })
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void appendLog({
        level: 'error',
        source: 'renderer',
        scope: 'window.unhandledRejection',
        message: event.reason instanceof Error ? event.reason.message : String(event.reason),
        details: toLogDetails(event.reason),
      })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
