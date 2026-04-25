# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build / Dev Commands

```bash
pnpm dev              # 启动 Vite 开发服务器（含 Electron HMR）
pnpm build            # tsc -b && vite build（类型检查 + 构建）
pnpm typecheck        # tsc -b（仅类型检查）
pnpm lint             # eslint .
pnpm preview          # vite preview 预览构建产物
pnpm start            # electron . 启动 Electron
pnpm pack             # pnpm build && electron-builder --dir（打包为目录）
pnpm dist             # pnpm build && electron-builder（发布包）
```

## Architecture Overview

Electron 三进程桌面应用，类似 Navicat/DBeaver 的跨平台数据库管理客户端。

### 进程分层

```
electron/main/          ← 主进程 (Node.js, 数据库驱动)
  main/main.ts             应用入口，创建 BrowserWindow
  ipc/                     IPC 处理器（按功能模块划分）
  db/                      数据库适配器实现（mysql2/pg/better-sqlite3）
  services/                服务层（连接文件持久化、密码加密、日志、查询取消注册表）

electron/preload/       ← Preload 桥接 (contextBridge)
  index.ts                暴露类型安全的 window.electronAPI

src/                    ← 渲染进程 (React 19)
  app/App.tsx             应用根组件
  layouts/MainLayout.tsx  布局（顶部栏 + 左侧抽屉 + 主区域）
  pages/WorkbenchPage.tsx 工作台页面
  features/               功能模块（explorer/sql/connections/table/settings）
  stores/                 Zustand 全局状态（workspaceStore + uiStore）
  theme/                  MUI 主题配置

shared/                 ← 主进程与渲染进程共享
  dto/                    数据传输对象（connection/query/explorer/table/api-result/app-log）
  adapter/                数据库适配器接口 DatabasePort
  ipc/channels.ts         IPC 通道常量
```

### 核心约定

**IPC 模式：** 所有通信使用 `ipcRenderer.invoke()` + `ipcMain.handle()`（请求-响应），无 event emitter。返回类型统一为 `ApiResult<T>`（`shared/dto/api-result.ts`）：

```typescript
// 成功: { success: true, data: T }
// 失败: { success: false, error: { code: string, message: string } }
```

**数据库适配器模式：** `shared/adapter/databasePort.ts` 定义统一接口，`electron/main/db/adapterFactory.ts` 为 mysql/postgres/sqlite 生成各自的 DatabaseAdapter 实例。渲染进程不直接接触数据库驱动。

**状态管理：** Zustand + persist 中间件（localStorage）。workspaceStore 持久化 key `biu-workspace`，uiStore 持久化 key `biu-database-ui`。修改 store 逻辑时需同步更新 `partialize` 和 `merge` 方法。

**Preload 类型安全：** `src/types/electron-api.d.ts` 声明 `ElectronAPI` 接口并挂载到 `window`。新增 IPC 通道时，需同步更新 preload/index.ts 和 electron-api.d.ts。

**路径别名：** `@/` → `src/`, `@shared/` → `shared/`（Vite + tsconfig 均配置）。

**样式：** 主要使用 MUI `sx` prop，AG Grid 通过 `themeQuartz.withPart()` 配置主题。

### 关键数据流

1. **连接管理：** ConnectionManager → `connection:list/create/update/delete` IPC → JSON 文件持久化 + 密码加密存储
2. **对象树：** ExplorerPanel → `explorer:loadChildren` IPC → adapter → MySQL: `SHOW DATABASES` + `information_schema` / PG: `information_schema` / SQLite: `sqlite_master`。节点 ID 使用 base64 编码（`m/d/{db}`、`m/t/{db}/{table}`、`p/s/{schema}`、`p/t/{schema}/{table}`）
3. **查询执行：** SqlWorkbench → `query:execute` IPC → `splitSqlStatements` 拆分 → 逐语句执行 → `SELECT COUNT(*)` 包装分页 + `LIMIT/OFFSET`。结果以 `QueryExecuteResult`（多结果集数组）返回 AG Grid 展示
4. **查询取消：** `query:cancel` IPC → `queryRunRegistry`（Map<queryRunId, cancelFn>）→ MySQL: `connection.destroy()` / PG: `client.end()`
5. **表数据编辑：** TableInspectorDialog → `table:updateRow/insertRow/deleteRow` IPC → 直接执行对应 DML

### TypeScript 配置

- 三个 tsconfig 子项目：`tsconfig.app.json`（渲染进程，ES2023 + DOM）、`tsconfig.electron.json`（主进程，ES2022 + Node）、`tsconfig.node.json`（Vite 配置）
- 根 `tsconfig.json` 使用 `references` 聚合
- 严格模式：`strict: true`，`noUncheckedIndexedAccess` 开启
- TypeScript 6.0 + typescript-eslint

### 数据库驱动注意点

- `mysql2`、`pg`、`better-sqlite3` 在 Vite 配置中被标记为 external（CJS + Node 内建依赖）
- SQLite 使用同步 API（`better-sqlite3`），不支持查询取消
- MySQL 使用 promise API（`mysql2/promise`），每条查询创建新连接，结束后销毁
- PostgreSQL 使用 `pg.Client`，同样每条查询新建连接

### 错误处理

错误流：`DB driver throw → IPC handler try/catch → wrapError() 写日志 + 返回 ApiFailure → 渲染进程检查 r.success 显示错误`

- IPC handler 统一使用 `wrapError(e, code)` 模式
- `QueryCancelledError` 特殊处理返回 `err('QUERY_CANCELLED', ...)`
- 渲染进程使用 `useWSStore.appendExecutionLog()` 记录所有操作日志
- AppProviders 注册 `window.onerror` + `onunhandledrejection` 通过 IPC 写入主进程日志

### 重要文件索引

| 目的 | 路径 |
|------|------|
| 主进程入口 | `electron/main/main.ts` |
| Preload 桥接 | `electron/preload/index.ts` |
| IPC 注册器 | `electron/main/ipc/register.ts` |
| IPC 通道常量 | `shared/ipc/channels.ts` |
| 数据库适配器接口 | `shared/adapter/databasePort.ts` |
| 适配器工厂 | `electron/main/db/adapterFactory.ts` |
| 查询执行引擎 | `electron/main/db/queryRun.ts` |
| SQL 工作台 UI | `src/features/sql/SqlWorkbench.tsx` |
| 对象树面板 | `src/features/explorer/ExplorerPanel.tsx` |
| Workspace Store | `src/stores/workspaceStore.ts` |
| UI Store | `src/stores/uiStore.ts` |
| Electron API 类型声明 | `src/types/electron-api.d.ts` |
| 连接 CRUD 持久化 | `electron/main/services/connectionsFile.ts` |
| 密码加密存储 | `electron/main/services/connectionPasswordStore.ts` |
| 查询取消注册表 | `electron/main/services/queryRunRegistry.ts` |
| 统一 API 结果类型 | `shared/dto/api-result.ts` |
| Vite 配置 | `vite.config.ts` |
