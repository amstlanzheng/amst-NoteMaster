import { app, globalShortcut, Tray, Menu, nativeImage, NativeImage } from 'electron'
import { getMainWindow, createMainWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initDatabase } from './database'
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
  // 直接生成一个 32x32 透明背景的托盘图标（蓝色圆环 + N 字母）
  const size = 32
  const rgba = Buffer.alloc(size * size * 4, 0) // 默认全透明

  const cx = 16, cy = 16
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      // 外圆环 (半径 12~14)
      if (dist >= 11.5 && dist < 14.5) {
        rgba[i] = 0x00; rgba[i + 1] = 0x78; rgba[i + 2] = 0xd4; rgba[i + 3] = 255
      }
      // 内部填充圆 (半径 < 11.5) 用浅蓝
      else if (dist < 11.5) {
        rgba[i] = 0x33; rgba[i + 1] = 0x99; rgba[i + 2] = 0xe0; rgba[i + 3] = 255
      }
      // 其余保持透明
    }
  }

  // 在圆心画一个白色 "N" 字母 (简化像素版)
  const nPixels = [
    // 左竖线 x=11
    [11,10],[11,11],[11,12],[11,13],[11,14],[11,15],[11,16],[11,17],[11,18],[11,19],[11,20],[11,21],
    // 右竖线 x=20
    [20,10],[20,11],[20,12],[20,13],[20,14],[20,15],[20,16],[20,17],[20,18],[20,19],[20,20],[20,21],
    // 对角线
    [12,11],[13,12],[14,13],[15,15],[16,16],[17,17],[18,18],[19,19],
    // 加粗左竖
    [12,10],[12,11],[12,12],[12,13],[12,14],[12,15],[12,16],[12,17],[12,18],[12,19],[12,20],[12,21],
    // 加粗右竖
    [19,10],[19,11],[19,12],[19,13],[19,14],[19,15],[19,16],[19,17],[19,18],[19,19],[19,20],[19,21],
  ]
  for (const [px, py] of nPixels) {
    if (px >= 0 && px < size && py >= 0 && py < size) {
      const i = (py * size + px) * 4
      rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255
    }
  }

  // 先创建 nativeImage，再导出为 PNG 文件，最后从文件加载（最可靠的方式）
  const tempImg = nativeImage.createFromBuffer(rgba, { width: size, height: size })
  const pngBuffer = tempImg.toPNG()
  const trayPngPath = join(app.getPath('userData'), 'tray-icon.png')
  
  // 验证颜色是否正确（检查第一个非透明像素）
  let firstPixelStr = ''
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] > 0) {
      firstPixelStr = `R:${rgba[i]}, G:${rgba[i+1]}, B:${rgba[i+2]}`
      break
    }
  }
  console.log('[Tray] First non-transparent pixel:', firstPixelStr)
  console.log('[Tray] Expected blue: R:0, G:120, B:212')
  
  writeFileSync(trayPngPath, pngBuffer)
  console.log('[Tray] Wrote tray PNG to:', trayPngPath, 'size:', pngBuffer.length)
  
  const img = nativeImage.createFromPath(trayPngPath)
  console.log('[Tray] Loaded tray icon from path, isEmpty:', img.isEmpty(), 'size:', img.getSize())
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
  await initDatabase()
  registerIpcHandlers()
  createAppMenu()
  
  // 设置默认的关闭行为（从 localStorage 读取会在渲染进程中处理）
  // 这里设置一个安全的默认值
  ;(app as any)._closeBehavior = 'quit'
  
  mainWindow = createMainWindow()
  
  // 等待窗口完全加载后再创建托盘，避免竞态条件
  mainWindow.once('ready-to-show', () => {
    console.log('[App] Window ready, creating tray...')
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
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  app.quit()
})
