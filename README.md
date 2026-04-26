# Database Assistant

一款面向开发者与数据相关岗位的**跨平台开源数据库管理桌面客户端**，在 Windows、macOS、Linux 上提供统一的连接管理、SQL 编辑与执行、对象浏览、表数据查看与编辑、导入导出等能力，目标为「开箱可用、体验现代、可持续扩展」的数据库工作台。

本项目在 **MIT 许可证** 下发布，详见仓库根目录 [LICENSE](./LICENSE) 与 `package.json` 中的 `license` 字段。

## 技术栈

- **桌面壳**：[Electron](https://www.electronjs.org/)
- **语言**：[TypeScript](https://www.typescriptlang.org/)
- **界面**：[React](https://react.dev/)、[MUI (Material UI)](https://mui.com/)
- **构建**：[Vite](https://vite.dev/)、[vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron)
- **其他**：Monaco Editor、AG Grid 等（完整列表见 `package.json` 的 `dependencies`）

主进程通过 Node 驱动与各类数据库通信；支持的数据库类型与能力以当前代码与发布说明为准。

## 环境要求

- 建议使用 **LTS 版本的 [Node.js](https://nodejs.org/)**（与团队本地开发环境一致即可）。
- 包管理器使用 **[pnpm](https://pnpm.io/)**（与仓库 `pnpm-lock.yaml` 配套）。

## 安装与本地开发

```bash
pnpm install
pnpm dev
```

`dev` 会由 Vite 与 [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron) 同时拉起渲染进程与 Electron 主进程，进入桌面端开发调试。

- `pnpm dev`：开发模式（Vite + Electron，含热更新）
- `pnpm build`：类型检查 + 构建前端与主进程资源
- `pnpm typecheck`：仅 TypeScript 项目引用检查（`tsc -b`）
- `pnpm lint`：ESLint
- `pnpm start`：在**已有**构建产物上启动 Electron（需先 `pnpm build`）
- `pnpm pack`：构建后按目录形式打包（`electron-builder --dir`）
- `pnpm dist`：构建后生成可分发安装包 / 压缩包
- `pnpm dist:win` / `pnpm dist:mac` / `pnpm dist:linux`：仅构建对应平台（需在对应系统或 CI 上执行）

打包产物目录由 [electron-builder](https://www.electron.build/) 配置，默认输出在 **`release/`** 下（以 `package.json` 的 `build.directories.output` 为准）。

## 项目结构（概览）

- `electron/main/`：Electron 主进程（窗口、IPC、数据库适配与系统能力）
- `electron/preload/`：预加载脚本，向渲染层暴露受控的 `contextBridge` API
- `src/`：渲染进程（React 页面与功能模块，如 SQL 工作台、连接、对象树等）
- `shared/`：主进程与渲染进程共用的类型、DTO、IPC 通道等

更细的架构与约定可参阅 [CLAUDE.md](./CLAUDE.md)（面向 AI/协作辅助）；产品需求见 [PRD.md](./PRD.md)。

## 文档

- 产品需求与规划：[**PRD.md**](./PRD.md)

## 参与贡献

欢迎通过 Issue / Pull Request 参与改进。贡献前建议：

- 在较大改动前先在 Issue 中说明意图，便于对齐方向。
- 提交前在本地执行 `pnpm typecheck` 与 `pnpm lint`，保持变更可审阅、可维护。

## 问题与反馈

若遇到缺陷或希望增加功能，请通过仓库的 **Issues** 反馈，并尽量说明操作系统、复现步骤与期望行为，便于定位。

## 第三方依赖与版权声明

- 本仓库**应用程序源码**在 MIT 下授权（见 [LICENSE](./LICENSE)）。
- 本软件依赖的 **npm 第三方库** 各自适用其官方许可证，使用时请遵守相应条款；完整依赖列表见 `package.json` 与 `pnpm-lock.yaml`。
- **Electron 内置 Chromium** 等组件受上游项目许可证约束，分发成品时请一并留意官方说明。

## 许可证（License）

**MIT License** — 版权所有 © 2026 TageCode（见 [LICENSE](./LICENSE)）。

在遵守 MIT 条件的前提下，你可以自由地使用、复制、修改、合并、发布、再许可和/或销售本软件的副本。
