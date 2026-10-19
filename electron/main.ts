import { app, BrowserWindow, ipcMain, session } from 'electron'
import express from 'express'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { Server } from 'socket.io'

const port = 4317
let controllerCount = 0
let activePads: Array<{ id: string; title: string; tint: string; key: string }> = []
let mainWindow: BrowserWindow | null = null

function getLanAddress() {
  const addresses = Object.values(networkInterfaces()).flatMap((items) => items ?? [])
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => item.address)
  const priority = (address: string) => address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? 2 : 3
  return addresses.sort((left, right) => priority(left) - priority(right))[0] ?? 'localhost'
}

function startControlServer() {
  const serverApp = express()
  const httpServer = createServer(serverApp)
  const io = new Server(httpServer, { cors: { origin: '*' } })

  io.on('connection', (socket) => {
    socket.emit('controller:count', controllerCount)
    socket.on('controller:join', () => {
      socket.data.isController = true
      controllerCount += 1
      io.emit('controller:count', controllerCount)
      socket.emit('pads:update', activePads)
    })
    socket.on('pad:play', (padId: string) => socket.broadcast.emit('pad:play', padId))
    socket.on('pads:update', (pads) => {
      activePads = pads
      io.emit('pads:update', activePads)
    })
    socket.on('disconnect', () => {
      if (socket.data.isController) {
        controllerCount = Math.max(0, controllerCount - 1)
        io.emit('controller:count', controllerCount)
      }
    })
  })

  if (app.isPackaged) {
    const rendererPath = join(app.getAppPath(), 'dist')
    serverApp.use(express.static(rendererPath))
    serverApp.get('/remote', (_request, response) => response.sendFile(join(rendererPath, 'index.html')))
  }

  httpServer.listen(port, '0.0.0.0')
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1050,
    minHeight: 720,
    backgroundColor: '#111412',
    title: 'SonicFlow Studio',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow = window
  window.on('close', () => console.info('[SonicFlow] Main window close requested'))
  window.on('closed', () => {
    console.info('[SonicFlow] Main window closed')
    mainWindow = null
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) console.error('[SonicFlow] Renderer load failed', errorCode, errorDescription, validatedURL)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[SonicFlow] Renderer process exited', details.reason, details.exitCode)
  })

  if (!app.isPackaged) {
    void window.loadURL('http://localhost:5173')
  } else {
    void window.loadFile(join(app.getAppPath(), 'dist', 'index.html'))
  }
}

ipcMain.handle('sonicflow:connection-url', () => {
  const address = getLanAddress()
  return `http://${address}:${app.isPackaged ? port : 5173}/remote`
})

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
  startControlServer()
  createWindow()
  app.on('activate', () => {
    if (mainWindow === null) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => console.info('[SonicFlow] Electron is quitting'))