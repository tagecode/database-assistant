import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import electron from 'vite-plugin-electron/simple'

const root = path.dirname(fileURLToPath(import.meta.url))

// base 为相对路径，打包后 file:// 协议可正确解析资源
// https://vite.dev/config/
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
      '@shared': path.join(root, 'shared'),
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    electron({
      main: {
        entry: 'electron/main/main.ts',
        vite: {
          build: {
            rollupOptions: {
              // 数据库驱动为 CJS + 依赖 Node 内建，必须外置，否则 Rolldown 打进去会在 ESM 中触发
              // “Calling require for node:buffer in an environment that doesn't expose require”
              external: [
                'mysql2',
                'mysql2/promise',
                'pg',
                'better-sqlite3',
              ],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload/index.ts',
      },
    }),
  ],
})
