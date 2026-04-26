import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ColorMode = 'light' | 'dark'
type ExecutionLogLevel = 'info' | 'success' | 'warning' | 'error'

const MAX_EXECUTION_LOGS = 200
export const DEFAULT_EDITOR_FONT_SIZE = 14
export const DEFAULT_QUERY_PAGE_SIZE = 200
export const DEFAULT_QUERY_TIMEOUT_MS = 30_000

export type ExecutionLogEntry = {
  id: string
  time: string
  level: ExecutionLogLevel
  title: string
  detail?: string
}

interface UIState {
  colorMode: ColorMode
  editorFontSize: number
  defaultQueryPageSize: number
  queryTimeoutMs: number
  executionLogs: ExecutionLogEntry[]
  executionLogUnreadCount: number
  executionLogPanelOpen: boolean
  toggleColorMode: () => void
  setColorMode: (mode: ColorMode) => void
  setEditorFontSize: (fontSize: number) => void
  setDefaultQueryPageSize: (pageSize: number) => void
  setQueryTimeoutMs: (timeoutMs: number) => void
  appendExecutionLog: (entry: Omit<ExecutionLogEntry, 'id' | 'time'>) => void
  clearExecutionLogs: () => void
  setExecutionLogPanelOpen: (open: boolean) => void
  markExecutionLogsRead: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      colorMode: 'light',
      editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
      defaultQueryPageSize: DEFAULT_QUERY_PAGE_SIZE,
      queryTimeoutMs: DEFAULT_QUERY_TIMEOUT_MS,
      executionLogs: [],
      executionLogUnreadCount: 0,
      executionLogPanelOpen: false,
      toggleColorMode: () =>
        set((s) => ({
          colorMode: s.colorMode === 'light' ? 'dark' : 'light',
        })),
      setColorMode: (mode) => set({ colorMode: mode }),
      setEditorFontSize: (fontSize) =>
        set({ editorFontSize: Math.min(28, Math.max(10, fontSize)) }),
      setDefaultQueryPageSize: (pageSize) =>
        set({ defaultQueryPageSize: Math.min(10_000, Math.max(1, pageSize)) }),
      setQueryTimeoutMs: (timeoutMs) =>
        set({ queryTimeoutMs: Math.min(600_000, Math.max(1_000, timeoutMs)) }),
      appendExecutionLog: (entry) =>
        set((s) => {
          const next = [
            {
              id:
                globalThis.crypto?.randomUUID?.() ??
                `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              time: new Date().toISOString(),
              ...entry,
            },
            ...s.executionLogs,
          ].slice(0, MAX_EXECUTION_LOGS)
          return {
            executionLogs: next,
            executionLogUnreadCount: s.executionLogPanelOpen
              ? 0
              : s.executionLogUnreadCount + 1,
          }
        }),
      clearExecutionLogs: () =>
        set({
          executionLogs: [],
          executionLogUnreadCount: 0,
        }),
      setExecutionLogPanelOpen: (open) =>
        set((s) => ({
          executionLogPanelOpen: open,
          executionLogUnreadCount: open ? 0 : s.executionLogUnreadCount,
        })),
      markExecutionLogsRead: () => set({ executionLogUnreadCount: 0 }),
    }),
    {
      name: 'database-assistant-ui',
      partialize: (s) => ({
        colorMode: s.colorMode,
        editorFontSize: s.editorFontSize,
        defaultQueryPageSize: s.defaultQueryPageSize,
        queryTimeoutMs: s.queryTimeoutMs,
        executionLogPanelOpen: s.executionLogPanelOpen,
      }),
    },
  ),
)
