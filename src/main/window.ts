import { BrowserWindow, app, shell, nativeImage, protocol } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

let mainWindow: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  // 注册自定义协议用于加载本地文件
  if (!protocol.isProtocolRegistered('notemaster')) {
    protocol.registerFileProtocol('notemaster', (request, callback) => {
      try {
        const url = request.url.replace(/^notemaster:\/\//, '')
        const decodedUrl = decodeURIComponent(url)
        // notemaster://files/xxx.png -> {userData}/notemaster-data/files/xxx.png
        const filePath = join(app.getPath('userData'), 'notemaster-data', decodedUrl)
        console.log('[Protocol] Request:', request.url)
        console.log('[Protocol] Mapped to:', filePath)
        console.log('[Protocol] Exists:', existsSync(filePath))
        callback({ path: filePath })
      } catch (error) {
        console.error('[Protocol] Error:', error)
        callback({ error: -2 }) // net::ERR_FAILED
      }
    })
  }

  // 加载应用图标
  const iconPath = join(__dirname, '../../resources/icon.png')
  let icon: any = undefined
  if (existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
    console.log('[Window] Icon loaded:', iconPath)
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    frame: true,
    titleBarStyle: 'default',
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    // 检查是否设置了最小化到托盘的行为
    const closeBehavior = (app as any)._closeBehavior || 'quit'
    console.log('[Window] Close event triggered, behavior:', closeBehavior, 'isQuitting:', (app as any).isQuitting)
    
    if (closeBehavior === 'minimize' && !(app as any).isQuitting) {
      e.preventDefault()
      console.log('[Window] Hiding window to tray')
      mainWindow?.hide()
      return
    }
    // 其他情况允许窗口关闭
    console.log('[Window] Allowing window to close')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
