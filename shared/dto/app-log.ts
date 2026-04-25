export type AppLogLevel = 'info' | 'warning' | 'error'

export type AppLogSource = 'main' | 'renderer'

export type AppLogAppendPayload = {
  level: AppLogLevel
  source: AppLogSource
  scope: string
  message: string
  details?: unknown
}

export type AppLogAppendData = {
  written: true
}
