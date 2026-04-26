import { app, BrowserWindow, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerIpcHandlers } from './ipc/register'
import { installMainProcessLogging } from './services/appLogger'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getPreloadPath() {
  return path.join(__dirname, 'index.mjs')
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  const devUrl = process.env['VITE_DEV_SERVER_URL']
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  installMainProcessLogging()
  registerIpcHandlers()
  // Windows / Linux：去掉系统默认「文件 / 编辑 / 视图…」菜单栏；macOS 保留标准菜单栏
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
