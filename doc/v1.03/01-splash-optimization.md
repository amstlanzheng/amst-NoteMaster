# 启动过渡窗口优化

## 变更概述

打包后启动时 splash 窗口一闪而过或无效。优化启动时序，移除独立 BrowserWindow splash，改用 HTML 内嵌 splash，确保数据库初始化与窗口显示并行。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/main/window.ts` | 移除 `createSplashWindow()` 和 `closeSplashWindow()`，不再创建独立渲染进程 |
| `src/main/index.ts` | 重构启动时序：先创建主窗口，再后台初始化数据库；`trySendDbReady()` 确保窗口显示后才发 `db:ready` 事件 |
| `src/renderer/index.html` | splash 最小显示时间 `MIN_SPLASH_MS = 1500ms`，防止一闪而过；白厄风格黄紫配色 |
| `src/preload/index.ts` | 新增 `isDbReady()` 和 `onDbReady()` API |
| `src/renderer/components/layout/AppLayout.vue` | `onMounted` 中先检查数据库是否就绪，未就绪则监听 `db:ready` 事件，5 秒兜底超时 |

## 启动流程变化

```
之前: app.whenReady → initDatabase(阻塞) → createMainWindow → ready-to-show → 显示窗口
现在: app.whenReady → createMainWindow → ready-to-show → 显示窗口(带 HTML splash) → initDatabase(后台) → db:ready → 渲染进程加载数据 → 隐藏 splash
```

### 时序保护

```typescript
// 两个条件都满足后才发送 db:ready
let windowShown = false
let dbInitialized = false

function trySendDbReady() {
  if (windowShown && dbInitialized) {
    setTimeout(() => mainWindow?.webContents.send('db:ready'), 100)
  }
}
```

### Splash 最小显示时间

```javascript
const MIN_SPLASH_MS = 1500
window.__appReady = function() {
  const elapsed = Date.now() - startTime
  const remaining = Math.max(0, MIN_SPLASH_MS - elapsed)
  setTimeout(hideSplash, remaining)
}
```
