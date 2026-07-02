import { app, globalShortcut, Tray, Menu, nativeImage, NativeImage } from 'electron'
import { getMainWindow, createMainWindow, createSplashWindow, closeSplashWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initDatabase, flushSaveDb } from './database'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'

let mainWindow: ReturnType<typeof createMainWindow> | null = null
let tray: Tray | null = null

function generateTrayIcon(): string {
  const iconPath = join(__dirname, '../../resources/icon.png')
  if (existsSync(iconPath)) {
    console.log('[Icon] Using existing icon:', iconPath)
    return iconPath
  }

  console.log('[Icon] Generating new icon...')
  const w = 256, h = 256
  const rgba = Buffer.alloc(w * h * 4, 0)
  const cx = 128, cy = 128
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 18 && dist < 80) {
        rgba[i] = 0x00; rgba[i + 1] = 0x78; rgba[i + 2] = 0xd4; rgba[i + 3] = 255
        const ix = Math.abs(dx), iy = Math.abs(dy)
        if (ix < 48 && iy < 48 && !(dx > -48 && dx < -10 && dy < 5 && dy > -37) && !(dx > 10 && dx < 48 && dy > 16 && dy < 48) && !(dy > 21 && dy < 53 && dx > -48 && dx < 48)) {
          rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255
        }
      }
    }
  }
  const img = nativeImage.createFromBuffer(rgba, { width: w, height: h, scaleFactor: 1 })
  const png = img.toPNG()
  mkdirSync(join(__dirname, '../../resources'), { recursive: true })
  writeFileSync(iconPath, png)
  console.log('[Icon] Icon generated successfully:', iconPath)
  return iconPath
}

function createTrayIcon(): NativeImage {
  // 从 resources/icon.png 加载 AM 图标作为托盘图标
  const iconPath = join(__dirname, '../../resources/icon.png')
  if (existsSync(iconPath)) {
    const fullIcon = nativeImage.createFromPath(iconPath)
    // 缩小到托盘图标尺寸 (16x16 用于 Windows 任务栏)
    const resized = fullIcon.resize({ width: 16, height: 16 })
    console.log('[Tray] Loaded AM icon from:', iconPath, 'isEmpty:', resized.isEmpty(), 'size:', resized.getSize())
    return resized
  }

  // 降级方案：生成简单的蓝色圆角矩形 + AM 图标
  console.log('[Tray] Icon file not found, generating fallback tray icon...')
  const size = 32
  const rgba = Buffer.alloc(size * size * 4, 0)

  const cx = 16, cy = 16
  const radius = 13
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      // 蓝色圆形背景
      if (dist < radius) {
        rgba[i] = 0x18; rgba[i + 1] = 0x64; rgba[i + 2] = 0xDC; rgba[i + 3] = 255
      }
    }
  }

  // 简化 AM 字母（白色像素）
  const amPixels = [
    // A 字母
    [9,10],[9,11],[9,12],[9,13],[9,14],[9,15],[9,16],[9,17],[9,18],[9,19],[9,20],[9,21],
    [10,10],[10,11],[10,12],[10,13],[10,14],[10,15],[10,16],[10,17],[10,18],[10,19],[10,20],[10,21],
    [11,10],[12,10],[13,10],[14,10],
    [11,11],[12,11],[13,11],[14,11],
    [11,15],[12,15],[13,15],[14,15],[15,15],[16,15],[17,15],[18,15],
    [11,16],[12,16],[13,16],[14,16],[15,16],[16,16],[17,16],[18,16],
    [17,10],[17,11],[17,12],[17,13],[17,14],
    [18,10],[18,11],[18,12],[18,13],[18,14],
    [17,17],[17,18],[17,19],[17,20],[17,21],
    [18,17],[18,18],[18,19],[18,20],[18,21],
    // M 字母
    [20,10],[20,11],[20,12],[20,13],[20,14],[20,15],[20,16],[20,17],[20,18],[20,19],[20,20],[20,21],
    [21,10],[21,11],[21,12],[21,13],[21,14],[21,15],[21,16],[21,17],[21,18],[21,19],[21,20],[21,21],
    [22,11],[22,12],[23,13],[23,14],
    [24,15],[24,16],[24,17],
    [25,13],[25,14],[26,11],[26,12],
    [27,10],[27,11],[27,12],[27,13],[27,14],[27,15],[27,16],[27,17],[27,18],[27,19],[27,20],[27,21],
    [28,10],[28,11],[28,12],[28,13],[28,14],[28,15],[28,16],[28,17],[28,18],[28,19],[28,20],[28,21],
  ]
  for (const [px, py] of amPixels) {
    if (px >= 0 && px < size && py >= 0 && py < size) {
      const i = (py * size + px) * 4
      rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255
    }
  }

  const tempImg = nativeImage.createFromBuffer(rgba, { width: size, height: size })
  const pngBuffer = tempImg.toPNG()
  const trayPngPath = join(app.getPath('userData'), 'tray-icon.png')
  writeFileSync(trayPngPath, pngBuffer)
  console.log('[Tray] Wrote fallback tray PNG to:', trayPngPath, 'size:', pngBuffer.length)

  const img = nativeImage.createFromPath(trayPngPath)
  console.log('[Tray] Loaded fallback tray icon, isEmpty:', img.isEmpty(), 'size:', img.getSize())
  return img
}

function createAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '打开文件', accelerator: 'CmdOrCtrl+O', click: () => getMainWindow()?.webContents.send('menu-open-file') },
        { label: '打开文件夹', accelerator: 'CmdOrCtrl+Shift+O', click: () => getMainWindow()?.webContents.send('menu-open-folder') },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '搜索', accelerator: 'CmdOrCtrl+Shift+F', click: () => getMainWindow()?.webContents.send('global-search') },
        { label: '数据统计', click: () => getMainWindow()?.webContents.send('menu-view-stats') },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '切换开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 AmNote',
          click: () => getMainWindow()?.webContents.send('show-about')
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createTray() {
  try {
    const trayIcon = createTrayIcon()
    
    if (trayIcon.isEmpty()) {
      console.error('[Tray] Tray icon is empty!')
    }
    
    tray = new Tray(trayIcon)
    console.log('[Tray] Tray created successfully')
    tray.setToolTip('AmNote - AI驱动的个人知识管理平台')

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    const win = getMainWindow()
    if (win) {
      win.show()
      win.focus()
    }
  })

  // 单击托盘图标也可以显示窗口（可选）
  tray.on('click', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isVisible()) {
        win.hide()
      } else {
        win.show()
        win.focus()
      }
    }
  })

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      accelerator: 'CmdOrCtrl+Shift+S',
      click: () => {
        const win = getMainWindow()
        if (win) { 
          win.show()
          win.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: '关于 AmNote',
      click: () => {
        const win = getMainWindow()
        if (win) {
          win.webContents.send('show-about')
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        ;(app as any).isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
  console.log('[Tray] Context menu set')
  } catch (error) {
    console.error('[Tray] Failed to create tray:', error)
  }
}

app.whenReady().then(async () => {
  // 立即显示 splash 窗口，让用户知道程序已启动
  createSplashWindow()

  await initDatabase()
  registerIpcHandlers()
  createAppMenu()
  
  // 设置默认的关闭行为（从 localStorage 读取会在渲染进程中处理）
  // 这里设置一个安全的默认值
  ;(app as any)._closeBehavior = 'quit'
  
  mainWindow = createMainWindow()
  
  // 主窗口准备好后关闭 splash
  mainWindow.once('ready-to-show', () => {
    console.log('[App] Window ready, closing splash and creating tray...')
    closeSplashWindow()
    mainWindow?.show()
    createTray()
  })

  globalShortcut.register('CommandOrControl+Shift+F', () => {
    const win = getMainWindow()
    if (win) {
      win.webContents.send('global-search')
    }
  })

  app.on('activate', () => {
    const win = getMainWindow()
    if (win) {
      win.show()
      win.focus()
    } else {
      mainWindow = createMainWindow()
    }
  })

  app.on('before-quit', () => {
  ;(app as any).isQuitting = true
  flushSaveDb()
})
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  app.quit()
})
