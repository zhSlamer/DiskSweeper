import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { registerIpc } from './ipc'

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#141414',
    autoHideMenuBar: true,
    title: '磁盘清理专家 DiskSweeper',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 渲染进程报错转发到终端，便于 dev 诊断
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer] ${message} (${sourceId}:${line})`)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// 单实例锁：防止双开导致重复扫描与状态分裂
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
