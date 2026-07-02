import { BrowserWindow, app, shell, nativeImage, protocol } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

export function createSplashWindow(): BrowserWindow {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  const splashHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:100vw;height:100vh;overflow:hidden;background:linear-gradient(135deg,#f5f7fa 0%,#e4e9f0 100%);font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;user-select:none;-webkit-app-region:no-drag}
.logo{width:64px;height:64px;background:#0078d4;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 8px 24px rgba(0,120,212,0.3);animation:pulse 2s ease-in-out infinite}
.logo svg{width:36px;height:36px;fill:#fff}
.title{font-size:24px;font-weight:700;color:#1a1a2e;margin-bottom:6px}
.sub{font-size:12px;color:#888;margin-bottom:28px}
.track{width:200px;height:3px;background:#ddd;border-radius:2px;overflow:hidden}
.bar{height:100%;width:0%;background:#0078d4;border-radius:2px;animation:prog 2.5s ease-in-out forwards}
.text{font-size:11px;color:#aaa;margin-top:14px}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes prog{0%{width:0%}20%{width:25%}50%{width:55%}80%{width:80%}100%{width:95%}}
</style></head><body>
<div class="logo"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM8 13h8v2H8v-2zm0 4h8v2H8v-2zm0-8h3v2H8V9z"/></svg></div>
<div class="title">AmNote</div>
<div class="sub">AI 驱动的个人知识管理平台</div>
<div class="track"><div class="bar"></div></div>
<div class="text">正在启动...</div>
</body></html>`

  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml))

  splashWindow.on('closed', () => {
    splashWindow = null
  })

  return splashWindow
}

export function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
    splashWindow = null
  }
}

export function createMainWindow(): BrowserWindow {
  // 注册自定义协议用于加载本地文件
  if (!protocol.isProtocolRegistered('amnote')) {
    protocol.registerFileProtocol('amnote', (request, callback) => {
      try {
        const url = request.url.replace(/^amnote:\/\//, '')
        const decodedUrl = decodeURIComponent(url)
        
        let filePath: string
        if (decodedUrl.startsWith('local/')) {
          // amnote://local/D:/book/images/xxx.png -> D:/book/images/xxx.png
          // 用于外部文件预览中的相对路径图片
          filePath = decodedUrl.replace(/^local\//, '')
        } else {
          // amnote://files/xxx.png -> {userData}/amnote-data/files/xxx.png
          filePath = join(app.getPath('userData'), 'amnote-data', decodedUrl)
        }
        
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
    backgroundColor: '#f0f2f5',
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // ready-to-show 由 index.ts 统一处理（关闭 splash 后显示主窗口）

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
