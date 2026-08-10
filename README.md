# AmNote (Tauri)

基于 Tauri 2 + Vue 3 的本地笔记管理应用。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Tauri 2 |
| 前端 | Vue 3 + TypeScript + Vite 7 |
| UI | Element Plus + Element Plus Icons |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 (Hash 模式) |
| 数据库 | SQLite (tauri-plugin-sql) |
| Markdown | markdown-it + highlight.js |
| 图表 | ECharts (vue-echarts) |
| 后端 | Rust |

## 项目结构

```
AmNoteTauri/
├── src/                        # 前端源码
│   ├── api.ts                  # Tauri IPC 调用封装（数据库操作 + 文件操作）
│   ├── main.ts                 # 入口
│   ├── App.vue
│   ├── router/index.ts         # 路由配置
│   ├── stores/                 # Pinia 状态管理
│   │   ├── category.ts         # 分类
│   │   ├── note.ts             # 笔记
│   │   ├── tag.ts              # 标签
│   │   ├── search.ts           # 搜索
│   │   └── ui.ts               # UI 状态
│   ├── views/                  # 页面视图
│   │   ├── HomeView.vue        # 首页
│   │   ├── FavoriteView.vue    # 收藏
│   │   ├── TagView.vue         # 标签
│   │   ├── SearchView.vue      # 搜索
│   │   ├── TrashView.vue       # 回收站
│   │   ├── StatsView.vue       # 统计
│   │   ├── FileSpaceView.vue   # 文件空间
│   │   ├── ExternalFilePreview.vue  # 外部文件预览
│   │   └── SettingsView.vue    # 设置
│   ├── components/
│   │   ├── layout/             # 布局组件
│   │   │   ├── AppLayout.vue
│   │   │   ├── AppSidebar.vue  # 侧边栏（分类树 + 外部文件面板）
│   │   │   ├── AppTopBar.vue
│   │   │   └── ExternalFileTree.vue
│   │   ├── editor/MdEditor.vue # Markdown 编辑器
│   │   ├── note/NoteList.vue   # 笔记列表
│   │   └── common/GlobalSearchDialog.vue
│   ├── utils/
│   │   ├── markdown.ts         # Markdown 渲染（markdown-it + 图片路径处理）
│   │   └── format.ts
│   └── shared/types.ts         # 类型定义
├── src-tauri/                  # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json         # Tauri 配置（窗口/打包/权限）
│   └── src/
│       ├── main.rs             # 入口
│       ├── lib.rs              # Tauri 插件注册 + 命令注册
│       └── file_commands.rs    # 文件操作命令（读写/扫描/外部文件）
└── package.json
```

## 开发环境

### 前置要求

- **Node.js** >= 18
- **Rust** (通过 [rustup](https://rustup.rs/) 安装)
- **Tauri CLI**: `npm install` 会自动安装 `@tauri-apps/cli`

### 安装依赖

```bash
npm install
```

### 启动开发模式

```bash
npm run tauri dev
```

- 前端 Vite 开发服务器：`http://localhost:1420`
- Rust 后端自动编译并启动窗口
- 前端修改即时热更新，Rust 修改自动重编译

### 构建

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/nsis/`，生成 NSIS 安装包。

## 前端 ↔ Rust 通信

### Tauri 命令 (invoke)

前端通过 `window.api` 或 `invoke()` 调用 Rust 命令，主要命令定义在 `file_commands.rs` 和 `lib.rs`：

| 命令 | 用途 |
|------|------|
| `save_local_file` | 保存文件到应用数据目录 |
| `read_file_as_base64` | 读取文件为 Base64（含 MIME） |
| `scan_referenced_files` | 扫描笔记引用的文件 |
| `get_all_files` / `get_file_path` | 获取应用数据目录文件列表 |
| `delete_file` / `clean_unused_files` | 删除/清理文件 |
| `scan_external_dirs` | 扫描外部目录树形结构 |
| `open_external_file` | 用系统默认程序打开外部文件 |
| `save_external_file` | 保存内容到外部文件 |
| `create_external_dir/file` | 创建外部目录/文件 |
| `delete_external_dir/file` | 删除外部目录/文件 |

### 自定义协议

| 协议 | 用途 |
|------|------|
| `amnote://files/xxx` | 应用内部数据目录的文件（笔记附件） |
| `amnote://local/xxx` | 外部文件的绝对路径图片 |

> `amnote://local/` 图片在 `ExternalFilePreview.vue` 中通过 `readFileAsBase64` 异步替换为 data URI 显示。

### 数据库操作

通过 `tauri-plugin-sql` 执行 SQLite 命令，封装在 `src/api.ts` 中，包括笔记 CRUD、分类管理、标签管理、搜索等。

## 路由

| 路径 | 视图 | 说明 |
|------|------|------|
| `/` | HomeView | 首页/笔记列表 |
| `/favorites` | FavoriteView | 收藏笔记 |
| `/tags` | TagView | 标签管理 |
| `/search` | SearchView | 全局搜索 |
| `/trash` | TrashView | 回收站 |
| `/stats` | StatsView | 使用统计 |
| `/files` | FileSpaceView | 文件空间 |
| `/external-preview` | ExternalFilePreview | 外部文件预览 |
| `/settings` | SettingsView | 设置 |

## 关键设计

- **笔记内容**：Markdown 格式存储，通过 `markdown-it` 渲染，支持代码高亮 (highlight.js)
- **文件存储**：笔记附件存储在应用数据目录 `amnote-data/files/`，外部文件通过系统路径直接访问
- **侧边栏**：分类树 + 外部文件面板，外部文件支持浏览目录、预览文本/图片/Markdown
- **窗口配置**：默认 1400x900，最小 1000x600，居中显示
