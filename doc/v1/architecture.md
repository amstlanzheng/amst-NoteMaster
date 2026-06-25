# NoteMaster 项目架构

## 项目概述

NoteMaster 是一款基于 Electron 的桌面笔记应用，采用 Vue 3 + TypeScript 技术栈，使用 SQLite (sql.js WASM) 作为本地数据库。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Electron | 42 |
| 前端 | Vue 3 | 3.5 |
| 状态管理 | Pinia | 3 |
| 路由 | Vue Router | 5 |
| UI 组件 | Element Plus | 2.14 |
| 构建 | electron-vite + Vite | 5 / 7 |
| 打包 | electron-builder | 26 |
| 数据库 | sql.js (SQLite WASM) | 1.12 |
| Markdown | markdown-it + highlight.js | 14 / 11 |
| 图表 | ECharts + vue-echarts | 6 / 8 |
| 云同步 | ssh2-sftp-client | 12 |
| 压缩 | JSZip | 3.10 |

## 三层架构

```
┌─────────────────────────────────────────┐
│            渲染进程 (Renderer)            │
│  Vue 3 + Pinia + Vue Router + Element   │
│  负责 UI 展示和用户交互                    │
├─────────────────────────────────────────┤
│            预加载脚本 (Preload)           │
│  contextBridge 安全桥接                   │
│  暴露 window.api 给渲染进程               │
├─────────────────────────────────────────┤
│            主进程 (Main)                  │
│  Electron 主进程                         │
│  数据库操作、文件系统、SFTP同步、窗口管理     │
└─────────────────────────────────────────┘
```

## 目录结构

```
NoteMaster/
├── src/
│   ├── main/                    # 主进程
│   │   ├── index.ts             # 入口：托盘、菜单、快捷键、生命周期
│   │   ├── database.ts          # SQLite 数据库初始化与 CRUD
│   │   ├── ipc.ts               # IPC 处理器（核心，所有前后端通信）
│   │   ├── sftp.ts              # SSH/SFTP 云同步
│   │   └── window.ts            # 窗口管理
│   ├── preload/
│   │   └── index.ts             # contextBridge 暴露 API
│   ├── renderer/                # 渲染进程
│   │   ├── App.vue              # 根组件
│   │   ├── main.ts              # Vue 入口（含 Mock API）
│   │   ├── router/index.ts      # 路由配置（9 个页面）
│   │   ├── stores/              # Pinia 状态管理
│   │   │   ├── note.ts          # 笔记状态
│   │   │   ├── category.ts      # 分类状态
│   │   │   ├── tag.ts           # 标签状态
│   │   │   ├── ui.ts            # UI 状态（深色模式、侧边栏宽度等）
│   │   │   └── search.ts        # 搜索状态
│   │   ├── views/               # 页面视图（9 个）
│   │   │   ├── HomeView.vue     # 首页（笔记列表 + 编辑器）
│   │   │   ├── FavoriteView.vue # 收藏笔记
│   │   │   ├── TagView.vue      # 标签管理
│   │   │   ├── SearchView.vue   # 搜索结果
│   │   │   ├── TrashView.vue    # 回收站
│   │   │   ├── StatsView.vue    # 数据统计（ECharts）
│   │   │   ├── FileSpaceView.vue# 文件空间
│   │   │   ├── SettingsView.vue # 设置页面
│   │   │   └── ExternalFilePreview.vue # 外部文件预览
│   │   ├── components/          # 组件
│   │   │   ├── layout/          # 布局组件
│   │   │   │   ├── AppLayout.vue      # 主布局
│   │   │   │   ├── AppSidebar.vue     # 侧边栏（分类树、归档、标签）
│   │   │   │   ├── AppTopBar.vue      # 顶部栏
│   │   │   │   ├── CategoryTreeItem.vue# 分类树节点（递归）
│   │   │   │   └── ExternalFileTree.vue# 外部文件树
│   │   │   ├── editor/
│   │   │   │   └── MdEditor.vue       # Markdown 编辑器
│   │   │   ├── note/
│   │   │   │   └── NoteList.vue       # 笔记列表
│   │   │   └── common/
│   │   │       └── GlobalSearchDialog.vue # 全局搜索
│   │   ├── utils/               # 工具函数
│   │   │   ├── format.ts        # 格式化（日期、文本截断）
│   │   │   └── markdown.ts      # Markdown 渲染配置
│   │   └── assets/styles/
│   │       └── global.css       # 全局样式（CSS 变量主题）
│   └── shared/
│       └── types.ts             # 共享类型定义
├── resources/icon.png           # 应用图标
├── electron.vite.config.ts      # 构建配置
├── electron-builder.yml         # 打包配置
├── tsconfig.json                # TypeScript 配置
└── package.json                 # 项目依赖
```

## 通信机制

渲染进程通过 `window.api` 调用主进程，所有方法在 `preload/index.ts` 中通过 `contextBridge.exposeInMainWorld` 暴露。

```
渲染进程 → window.api.xxx() → preload bridge → ipcRenderer.invoke() → ipcMain.handle()
```

核心 IPC 通道命名规范：`db:xxx`（数据库操作）、`file:xxx`（文件操作）、`sync:xxx`（同步操作）。

## 数据库

- **引擎**：sql.js（SQLite WASM 版本），无需原生编译
- **路径**：`%APPDATA%/notemaster/notemaster.db`
- **表结构**：

| 表名 | 用途 |
|------|------|
| notes | 笔记（标题、内容、分类、收藏、置顶、删除标记） |
| categories | 分类（支持无限层级，parent_id 递归） |
| tags | 标签（名称、颜色） |
| note_tags | 笔记-标签关联（多对多） |
| note_versions | 笔记历史版本 |
| settings | 应用设置（键值对） |
| search_history | 搜索历史 |
| external_files | 外部导入文件记录 |

## 图片存储

支持两种模式（设置中可切换）：
- **Base64 嵌入**：图片转 Base64 直接嵌入 Markdown
- **文件夹存储**：图片保存到 `notemaster-data/files/`，Markdown 中引用路径

## Mock API 机制

当 `window.api` 不存在时（浏览器环境），`main.ts` 中的 `createMockApi()` 自动创建内存模拟数据库，支持所有后端操作的模拟。
