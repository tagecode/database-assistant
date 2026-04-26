# Database Assistant

一款面向开发者与数据相关岗位的**跨平台开源数据库管理桌面客户端**，在 Windows、macOS、Linux 上提供统一的连接管理、SQL 编辑与执行、对象浏览、表数据查看与编辑、导入导出等能力，目标为「开箱可用、体验现代、可持续扩展」的数据库工作台。

## 技术栈

| 类别 | 技术 |
|------|------|
| 桌面壳 | [Electron](https://www.electronjs.org/) |
| 语言 | [TypeScript](https://www.typescriptlang.org/) |
| 界面 | [React](https://react.dev/)、[MUI (Material UI)](https://mui.com/) |
| 构建 | [Vite](https://vite.dev/)、[vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron) |
| 其他 | Monaco Editor、AG Grid 等（详见 `package.json`） |

主进程侧通过 Node 驱动与各类数据库通信；具体支持的数据库类型以代码与发布说明为准。

## 本地开发

已安装 **Node.js** 与 [pnpm](https://pnpm.io/) 后：

```bash
pnpm install
pnpm dev
```

`dev` 会由 Vite 与 [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron) 同时拉起渲染进程与 Electron 主进程，进入桌面端开发调试。

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发模式（Vite + Electron） |
| `pnpm build` | 类型检查 + 构建 |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm lint` | ESLint |
| `pnpm start` | 在已有构建产物上启动 Electron（一般先 `pnpm build`） |
| `pnpm pack` / `pnpm dist` | 使用 electron-builder 打包，输出见配置 |

## 文档

产品需求与规划见仓库内 [**PRD.md**](./PRD.md)。
