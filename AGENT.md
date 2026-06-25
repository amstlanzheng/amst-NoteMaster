# NoteMaster 项目文档索引

> 生成日期：2026-06-24  
> 本文档为 AI 助手提供快速了解项目的导航入口。

## 文档目录

```
doc/2026-06-24/
├── architecture.md      # 项目架构（技术栈、目录结构、通信机制、数据库）
├── features.md          # 功能模块（12 大核心功能、页面路由、侧边栏结构）
├── development-guide.md # 开发规范（代码风格、IPC 通信、状态管理、常见陷阱）
└── build-config.md      # 配置与构建（开发命令、打包配置、electron-builder）
```

## 快速导航

### 想了解项目整体？
→ [architecture.md](doc/2026-06-24/architecture.md)  
包含：技术栈表格、三层架构图、完整目录树、数据库表结构、Mock API 说明

### 想了解有哪些功能？
→ [features.md](doc/2026-06-24/features.md)  
包含：12 大功能模块详解、9 个页面路由说明、侧边栏三段式布局

### 准备开始开发？
→ [development-guide.md](doc/2026-06-24/development-guide.md)  
包含：TypeScript/Vue/CSS 规范、IPC 命名约定、Pinia Store 职责、6 个常见陷阱、调试技巧

### 需要构建或打包？
→ [build-config.md](doc/2026-06-24/build-config.md)  
包含：npm 脚本说明、electron-builder 配置表、国内镜像配置、环境变量

## 项目速览

| 属性 | 值 |
|------|-----|
| 项目名称 | NoteMaster |
| 类型 | Electron 桌面笔记应用 |
| 前端框架 | Vue 3.5 + TypeScript |
| 状态管理 | Pinia 3 |
| UI 组件 | Element Plus 2.14 |
| 数据库 | sql.js (SQLite WASM) |
| 构建工具 | electron-vite 5 + Vite 7 |
| 打包工具 | electron-builder 26 (NSIS) |

## 核心文件定位

| 用途 | 文件路径 |
|------|----------|
| 主进程入口 | `src/main/index.ts` |
| IPC 处理器（核心） | `src/main/ipc.ts` (1900+ 行) |
| 数据库初始化 | `src/main/database.ts` |
| SFTP 同步 | `src/main/sftp.ts` |
| Preload 桥接 | `src/preload/index.ts` |
| Vue 入口 | `src/renderer/main.ts` |
| 路由配置 | `src/renderer/router/index.ts` |
| 共享类型 | `src/shared/types.ts` |
| 侧边栏组件 | `src/renderer/components/layout/AppSidebar.vue` |
| Markdown 编辑器 | `src/renderer/components/editor/MdEditor.vue` |
| 笔记列表 | `src/renderer/components/note/NoteList.vue` |

## 常用命令

```bash
npm run dev              # 启动开发服务器
npm run build            # 编译（不打包）
npm run package          # 打包便携版 exe
npm run package:installer# 打包 NSIS 安装包
npm run typecheck        # TypeScript 类型检查
npm run lint             # ESLint 修复
```

## 关键设计决策

1. **数据库**：使用 sql.js (WASM) 而非 better-sqlite3，避免原生编译依赖
2. **图片存储**：支持 Base64 嵌入和文件夹引用两种模式，设置中可切换
3. **分类层级**：无限层级通过 parent_id 递归实现，CategoryTreeItem 为递归组件
4. **笔记过滤**：点击分类只显示该分类的直接笔记，不含子分类笔记
5. **Mock API**：浏览器环境下自动启用内存模拟，方便 UI 独立开发
6. **IPC 通信**：所有渲染进程到主进程的调用通过 contextBridge 安全桥接

## 注意事项

- **preload 修改需重启**：preload 脚本不支持热更新
- **Vue Proxy 序列化**：通过 IPC 传递前需用 `JSON.parse(JSON.stringify())` 转换
- **asarUnpack 配置**：sql.js、ssh2-sftp-client 等原生模块必须 unpack
- **深色模式**：通过 CSS 变量 `:root.dark` 切换，由 uiStore 控制
