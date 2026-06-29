# AmNote 项目索引

> 项目：AmNote | 类型：Electron 桌面笔记应用 | 技术栈：Vue 3 + TypeScript + Pinia + Element Plus + sql.js

## 文档导航

### v1.01 变更文档（2026-06-26）

```
doc/v1.01/
├── 01-element-plus-on-demand.md  # Element Plus 按需引入，减小打包体积
├── 02-database-debounce.md       # 数据库防抖写入，减少 I/O
├── 03-code-cleanup.md            # 移除死代码、调试按钮、命名修正
├── 04-sidebar-style-fix.md       # 侧边栏日期归档/标签区域贴边修复
├── 05-note-sort-order-fix.md     # 点击查看笔记时排序变化修复
├── 06-sort-feature.md            # 新增排序功能（时间/权重）
└── 07-editor-improvements.md     # Tab键修复 + Markdown工具栏光标插入
```

### v1.0 基础文档

```
doc/v1/
├── architecture.md      # 项目架构（技术栈、目录结构、通信机制、数据库）
├── features.md          # 功能模块（12 大核心功能、页面路由、侧边栏结构）
├── development-guide.md # 开发规范（代码风格、IPC 通信、状态管理、常见陷阱）
└── build-config.md      # 配置与构建（开发命令、打包配置、electron-builder）
```

## 核心文件

| 用途 | 路径 |
|------|------|
| 主进程入口 | `src/main/index.ts` |
| IPC 处理器 | `src/main/ipc.ts` |
| 数据库层 | `src/main/database.ts` |
| Preload 桥接 | `src/preload/index.ts` |
| Vue 入口 | `src/renderer/main.ts` |
| 共享类型 | `src/shared/types.ts` |
| 侧边栏 | `src/renderer/components/layout/AppSidebar.vue` |
| 编辑器 | `src/renderer/components/editor/MdEditor.vue` |
| 笔记列表 | `src/renderer/components/note/NoteList.vue` |
| UI 状态 | `src/renderer/stores/ui.ts` |
| 笔记状态 | `src/renderer/stores/note.ts` |

## 常用命令

```bash
npm run dev              # 启动开发服务器
npm run build            # 编译
npm run package          # 打包便携版 exe
```

## 关键设计决策

- **数据库**：sql.js (WASM)，防抖写入 300ms，退出前 flushSaveDb()
- **排序**：置顶 > 权重(ASC) > 时间(DESC)，默认权重 999
- **编辑器**：execCommand 插入文本以支持 Ctrl+Z 撤销
- **Element Plus**：unplugin 按需引入 + 手动注册 28 个图标
- **Mock API**：浏览器环境自动启用内存模拟
