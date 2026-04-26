import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QueryContext, QueryResultSet } from '@shared/dto/query'
import { DEFAULT_QUERY_PAGE_SIZE, useUIStore } from './uiStore'

const defaultSql = `-- 在此编写 SQL，按「执行」发送到当前连接\nSELECT 1;\n`

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `t-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export interface SqlTab {
  id: string
  title: string
  sql: string
  isDirty: boolean
  queryContext: QueryContext | null
  queryPageSize: number
  lastResults: QueryResultSet[]
  activeResultIndex: number
  lastTotalDurationMs: number
  lastError: string | null
}

function makeTab(over: Partial<SqlTab> & { sql?: string; title?: string } = {}): SqlTab {
  const defaultQueryPageSize = useUIStore.getState().defaultQueryPageSize
  return {
    id: over.id ?? newId(),
    title: over.title?.trim() || `查询`,
    sql: over.sql ?? defaultSql,
    isDirty: over.isDirty ?? false,
    queryContext: over.queryContext ?? null,
    queryPageSize: over.queryPageSize ?? defaultQueryPageSize,
    lastResults: over.lastResults ?? [],
    activeResultIndex: over.activeResultIndex ?? 0,
    lastTotalDurationMs: over.lastTotalDurationMs ?? 0,
    lastError: over.lastError ?? null,
  }
}

interface WorkspaceState {
  connectionListVersion: number
  bumpConnectionList: () => void

  selectedConnectionId: string | null
  setSelectedConnectionId: (id: string | null) => void
  selectedQueryContext: QueryContext | null
  setSelectedQueryContext: (context: QueryContext | null) => void

  sqlTabs: SqlTab[]
  activeTabId: string | null

  setTabSql: (id: string, sql: string) => void
  setActiveTab: (id: string) => void
  addSqlTab: (init?: { title?: string; sql?: string }) => void
  closeSqlTab: (id: string) => void
  closeOtherSqlTabs: (id: string) => void
  closeAllSqlTabs: () => void
  setTabQueryPageSize: (id: string, pageSize: number) => void
  setTabResults: (id: string, data: QueryResultSet[], totalDurationMs: number) => void
  setActiveResultIndex: (id: string, index: number) => void
  updateTabResult: (
    id: string,
    index: number,
    data: Partial<QueryResultSet>,
  ) => void
  setTabError: (id: string, message: string | null) => void
  /**
   * 将当前选中的表/树 SQL 放入：默认新开一页签（可覆盖「替换成当前」行为改此处）
   */
  openQueryFromExplorer: (
    sql: string,
    title?: string,
    queryContext?: QueryContext | null,
  ) => void
  /** 兼容旧接口：只覆盖当前活动标签内容 */
  setActiveTabOnlySql: (sql: string) => void
}

const initial = (() => {
  const t = makeTab({ title: '查询 1' })
  return { sqlTabs: [t] as SqlTab[], activeTabId: t.id }
})()

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      connectionListVersion: 0,
      bumpConnectionList: () =>
        set((s) => ({ connectionListVersion: s.connectionListVersion + 1 })),

      selectedConnectionId: null,
      setSelectedConnectionId: (id) => set({ selectedConnectionId: id }),
      selectedQueryContext: null,
      setSelectedQueryContext: (context) => set({ selectedQueryContext: context }),

      sqlTabs: initial.sqlTabs,
      activeTabId: initial.activeTabId,

      setTabSql: (id, sql) =>
        set((s) => ({
          sqlTabs: s.sqlTabs.map((t) =>
            t.id === id ? { ...t, sql, isDirty: true } : t,
          ),
        })),

      setActiveTab: (id) => {
        if (!get().sqlTabs.some((t) => t.id === id)) {
          return
        }
        set({ activeTabId: id })
      },

      addSqlTab: (init) => {
        const n = get().sqlTabs.length + 1
        const tab = makeTab({
          title: init?.title ?? `查询 ${n}`,
          sql: init?.sql ?? defaultSql,
        })
        set((s) => ({
          sqlTabs: [...s.sqlTabs, tab],
          activeTabId: tab.id,
        }))
      },

      closeSqlTab: (id) => {
        set((s) => {
          if (s.sqlTabs.length <= 1) {
            const t = makeTab({ title: '查询 1' })
            return { sqlTabs: [t], activeTabId: t.id }
          }
          const next = s.sqlTabs.filter((t) => t.id !== id)
          let act = s.activeTabId
          if (act === id) {
            const idx = s.sqlTabs.findIndex((t) => t.id === id)
            const pick = next[Math.max(0, idx - 1)] ?? next[0]
            act = pick?.id ?? null
          }
          return { sqlTabs: next, activeTabId: act }
        })
      },

      closeOtherSqlTabs: (id) =>
        set((s) => {
          const keep = s.sqlTabs.find((t) => t.id === id)
          if (!keep) {
            return {}
          }
          return { sqlTabs: [keep], activeTabId: keep.id }
        }),

      closeAllSqlTabs: () => {
        const t = makeTab({ title: '查询 1' })
        set({ sqlTabs: [t], activeTabId: t.id })
      },

      setTabQueryPageSize: (id, pageSize) =>
        set((s) => ({
          sqlTabs: s.sqlTabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  queryPageSize: Math.min(10_000, Math.max(1, pageSize)),
                }
              : t,
          ),
        })),

      setTabResults: (id, data, totalDurationMs) =>
        set((s) => ({
          sqlTabs: s.sqlTabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  isDirty: false,
                  lastResults: data,
                  activeResultIndex: 0,
                  lastTotalDurationMs: totalDurationMs,
                  lastError: null,
                }
              : t,
          ),
        })),

      setActiveResultIndex: (id, index) =>
        set((s) => ({
          sqlTabs: s.sqlTabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  activeResultIndex: Math.max(
                    0,
                    Math.min(index, Math.max(0, t.lastResults.length - 1)),
                  ),
                }
              : t,
          ),
        })),

      updateTabResult: (id, index, data) =>
        set((s) => ({
          sqlTabs: s.sqlTabs.map((t) => {
            if (t.id !== id) {
              return t
            }
            if (index < 0 || index >= t.lastResults.length) {
              return t
            }
            return {
              ...t,
              lastResults: t.lastResults.map((item, itemIndex) =>
                itemIndex === index ? { ...item, ...data } : item,
              ),
            }
          }),
        })),

      setTabError: (id, message) =>
        set((s) => ({
          sqlTabs: s.sqlTabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  lastError: message,
                  lastResults: [],
                  activeResultIndex: 0,
                  lastTotalDurationMs: 0,
                }
              : t,
          ),
        })),

      openQueryFromExplorer: (sql, title, queryContext) => {
        const n = get().sqlTabs.length + 1
        const tab = makeTab({
          title: title?.trim() || `查询 ${n}`,
          sql,
          queryContext: queryContext ?? get().selectedQueryContext,
        })
        set((s) => ({
          sqlTabs: [...s.sqlTabs, tab],
          activeTabId: tab.id,
        }))
      },

      setActiveTabOnlySql: (sql) => {
        const act = get().activeTabId
        if (!act) {
          return
        }
        set((s) => ({
          sqlTabs: s.sqlTabs.map((t) => (t.id === act ? { ...t, sql } : t)),
        }))
      },
    }),
    {
      name: 'database-assistant-workspace',
      partialize: (s) => ({
        selectedConnectionId: s.selectedConnectionId,
        selectedQueryContext: s.selectedQueryContext,
        sqlTabs: s.sqlTabs.map((t) => ({
          id: t.id,
          title: t.title,
          sql: t.sql,
          isDirty: t.isDirty,
          queryPageSize: t.queryPageSize,
          queryContext: t.queryContext,
        })),
        activeTabId: s.activeTabId,
      }),
      version: 1,
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object') {
          return current
        }
        const p = persisted as {
          selectedConnectionId?: string | null
          selectedQueryContext?: QueryContext | null
          sqlTabs?: Array<
            Pick<SqlTab, 'id' | 'title' | 'sql' | 'isDirty'> &
              Partial<Pick<SqlTab, 'queryPageSize' | 'queryContext'>>
          >
          activeTabId?: string | null
        }
        if (!p.sqlTabs?.length) {
          return current
        }
        const sqlTabs: SqlTab[] = p.sqlTabs.map((t) => ({
          ...t,
          isDirty: t.isDirty ?? false,
          queryContext: t.queryContext ?? null,
          queryPageSize: t.queryPageSize ?? DEFAULT_QUERY_PAGE_SIZE,
          lastResults: [],
          activeResultIndex: 0,
          lastTotalDurationMs: 0,
          lastError: null,
        }))
        const hasActive =
          p.activeTabId != null &&
          sqlTabs.some((t) => t.id === p.activeTabId)
        const activeTabId: string | null = hasActive
          ? p.activeTabId!
          : (sqlTabs[0]?.id ?? null)
        return {
          ...current,
          selectedConnectionId: p.selectedConnectionId ?? current.selectedConnectionId,
          selectedQueryContext: p.selectedQueryContext ?? null,
          sqlTabs,
          activeTabId,
        }
      },
    },
  ),
)
