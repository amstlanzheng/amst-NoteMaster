# NoteMaster 开发规范

## 代码风格

### TypeScript
- 目标版本：ES2022
- 模块系统：ESNext
- 严格模式开启（`noImplicitAny: false`）
- 路径别名：`@/` → `src/renderer/`，`@shared/` → `src/shared/`

### Vue 3
- 使用 `<script setup>` 语法
- 组合式 API
- Pinia Store 使用函数式定义

### CSS
- 使用 scoped 样式
- 通过 CSS 变量实现主题切换
- 全局样式定义在 `global.css`

## 主题系统

CSS 变量定义在 `global.css`，支持深色/浅色模式：

```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #303133;
  --text-secondary: #606266;
  --accent-color: #409eff;
  --border-color: #dcdfe6;
}

:root.dark {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --accent-color: #409eff;
  --border-color: #404040;
}
```

## IPC 通信规范

### 命名约定
- 数据库操作：`db:xxx`（如 `db:get-notes`、`db:create-note`）
- 文件操作：`file:xxx`（如 `file:get-all-files`、`file:delete`）
- 同步操作：`sync:xxx`（如 `sync:test-connection`、`sync:upload`）
- 事件监听：`onXxxProgress`、`onGlobalSearch`

### Preload 暴露
所有 IPC 方法通过 `contextBridge.exposeInMainWorld('api', {...})` 暴露给渲染进程。

### 类型安全
在 `preload/index.ts` 中定义完整的 TypeScript 接口供渲染进程使用。

## 状态管理

### Pinia Store 职责划分
| Store | 职责 |
|-------|------|
| note | 笔记 CRUD、当前笔记、筛选条件 |
| category | 分类树、收藏分类、选中分类 |
| tag | 标签列表 |
| ui | 深色模式、侧边栏宽度、搜索弹窗状态、显示数量开关 |
| search | 搜索关键词、历史记录 |

### 注意事项
- 通过 IPC 传递对象时，使用 `JSON.parse(JSON.stringify(obj))` 或 `toPlain()` 解决 Vue Proxy 序列化问题

## 组件设计

### 递归组件
`CategoryTreeItem.vue` 是递归组件，用于渲染无限层级分类树。

### 布局组件
- `AppLayout.vue`：主布局容器
- `AppSidebar.vue`：三段式可拉伸侧边栏
- `AppTopBar.vue`：顶部工具栏

## 图片处理

### Base64 模式
粘贴图片时转换为 Base64 嵌入 Markdown，适合小图片、单文件分享场景。

### 文件夹模式
粘贴图片时保存到 `notemaster-data/files/`，Markdown 中引用相对路径，适合大量图片场景。

导出时需同时打包图片文件夹。

## 常见陷阱

### 1. Electron preload 脚本修改需重启
preload 脚本不支持热更新，修改后必须完全重启应用才能生效。

### 2. Vue Proxy 对象无法通过 IPC 传递
Pinia store 中的响应式对象是 Proxy，直接传给 IPC 会失败。必须先用 `JSON.parse(JSON.stringify(obj))` 转为普通对象。

### 3. sql.js WASM 文件定位
开发环境和打包后的 WASM 文件路径不同，`locateWasm()` 函数需要分别处理。

### 4. electron-builder asarUnpack
sql.js、ssh2-sftp-client 等包含原生模块的包必须配置到 `asarUnpack`，否则运行时会找不到文件。

### 5. GitHub 推送失败
遇到网络问题时切换到 SSH 协议或配置代理。

### 6. 打包时 exe 文件被锁定
如果应用正在运行，electron-builder 无法覆盖 exe。先关闭应用再打包。

## 调试技巧

### 主进程日志
```typescript
console.log('[Module] message') // 在终端查看
```

### 渲染进程日志
浏览器 DevTools Console 中查看。

### 数据库路径
设置页面可查看当前数据库文件路径。

## Mock API 开发

浏览器环境下 `window.api` 不存在时，`main.ts` 中的 `createMockApi()` 自动创建内存模拟：
- 使用 Map 存储数据
- 模拟异步延迟
- 支持所有后端接口的 mock 实现

方便在不启动 Electron 的情况下开发 UI。
