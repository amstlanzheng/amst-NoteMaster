# AmNote (Tauri)

基于 Tauri 2 + Vue 3 的本地笔记管理应用。Markdown 笔记、分类/标签管理、全文搜索、外部文件浏览与导入，数据完全本地存储（SQLite + 文件系统）。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 (Rust) |
| 前端 | Vue 3 + TypeScript + Vite 7 |
| UI | Element Plus |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 (Hash 模式) |
| 数据库 | SQLite (tauri-plugin-sql，前端直连) |
| Markdown | markdown-it + highlight.js |
| 图表 | ECharts (vue-echarts) |

## 快速开始

### 前置环境（新机器只需安装一次）

| 依赖 | 说明 | 验证 |
|------|------|------|
| Node.js >= 18 | 前端构建 | `node -v` |
| Rust (rustup) | 后端编译 | `cargo -v` |
| MSVC 生成工具 | Windows 编译 Rust 必需（Visual Studio Build Tools → "C++ 生成工具"工作负荷） | — |

### 拉取代码后运行

```bash
git clone <repo-url>
cd AmNoteTauri
npm install        # 安装前端依赖（含 Tauri CLI）
npm run tauri dev  # 启动开发模式
```

> 首次 `cargo build` 需联网下载 crates.io 依赖；网络受限可配置国内镜像（如 rsproxy）。

### 开发模式说明

- Vite 开发服务器：`http://localhost:1420`（支持 HMR）
- Rust 后端自动编译并弹出应用窗口
- 前端改动即时热更新，Rust 改动自动重编译

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm run tauri dev` | 开发模式（热更新） |
| `npm run build` | 仅构建前端到 `dist/` |
| `npm run build:portable` | **免安装包**（推荐），输出 `output-YYYYMMDD-HHmmss/amnote-tauri.exe` |
| `npm run build:win` | NSIS 安装包，输出 `src-tauri/target/release/bundle/nsis/` |

## 打包

### 免安装包（推荐）

```bash
npm run build:portable
```

- 执行 `tauri build --no-bundle`：构建前端 + 编译 Rust + **嵌入前端资源到 exe**，跳过安装包打包
- 产物：`output-YYYYMMDD-HHmmss/amnote-tauri.exe`，双击即用
- 全程无需联网，适合国内网络环境

### NSIS 安装包

```bash
npm run build:win
```

需联网下载 NSIS 工具与 WebView2 bootstrapper。网络不通时报错 `failed to bundle project: io: Connection refused`，解决方案（三选一）：

1. 手动下载 [nsis-3.11.zip](https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip)，解压到 `%LOCALAPPDATA%\tauri\nsis\`
2. 手动下载 WebView2 安装包，设置环境变量：
   ```powershell
   $env:WEBVIEW2_BOOTSTRAPPER_PATH = "C:\path\to\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
   ```
3. 配置代理：
   ```powershell
   $env:HTTP_PROXY="http://127.0.0.1:7890"; $env:HTTPS_PROXY="http://127.0.0.1:7890"
   ```

### 打包注意事项

1. **禁止裸 `cargo build --release` 打包**：直接 cargo 编译的 exe 不会嵌入前端资源，运行时会去连 devUrl `http://localhost:1420` 报 `ERR_CONNECTION_REFUSED`。必须用 `tauri build --no-bundle`（由 Tauri CLI 完成资源嵌入）。
2. **`[[bin]]` 声明**：`src-tauri/Cargo.toml` 中必须保留 `[[bin]]` 配置，否则只编译库不生成 exe。
3. **chunk 体积警告**：Vite 提示部分 chunk 超过 500kB 属正常（echarts / markdown-it 体积大），不影响功能。

## 项目结构

```
AmNoteTauri/
├── src/                        # 前端源码
│   ├── api.ts                  # window.api 封装（SQL + Tauri 命令调用 + 业务组装）
│   ├── main.ts                 # 入口
│   ├── router/index.ts         # 路由配置
│   ├── stores/                 # Pinia：category / note / tag / search / ui
│   ├── views/                  # 页面视图
│   │   ├── HomeView.vue        # 首页（笔记列表）
│   │   ├── FavoriteView.vue    # 收藏
│   │   ├── TagView.vue         # 标签
│   │   ├── SearchView.vue      # 搜索
│   │   ├── TrashView.vue       # 回收站
│   │   ├── StatsView.vue       # 统计
│   │   ├── FileSpaceView.vue   # 文件空间（附件管理）
│   │   ├── ExternalFilePreview.vue  # 外部文件预览
│   │   └── SettingsView.vue    # 设置
│   ├── components/
│   │   ├── layout/             # AppLayout / AppSidebar / AppTopBar / CategoryTreeItem / ExternalFileTree
│   │   ├── editor/MdEditor.vue # Markdown 编辑器
│   │   ├── note/NoteList.vue   # 笔记列表
│   │   └── common/GlobalSearchDialog.vue
│   ├── utils/
│   │   ├── markdown.ts         # Markdown 渲染 + 图片路径处理（amnote:// 协议）
│   │   └── format.ts           # 日期/大小格式化
│   └── shared/types.ts         # 前后端共享类型
├── src-tauri/                  # Rust 后端
│   ├── Cargo.toml              # 含 [[bin]] 声明（必需）
│   ├── tauri.conf.json         # 窗口/打包/权限配置
│   └── src/
│       ├── main.rs             # 入口
│       ├── lib.rs              # 插件注册 + invoke 命令注册
│       └── file_commands.rs    # 文件操作命令（读写/扫描/外部文件/导入）
├── scripts/
│   └── build-portable.mjs      # 免安装包复制脚本（生成 output-时间戳目录）
└── package.json
```

## 架构设计

### 前后端分工

| 职责 | 位置 | 说明 |
|------|------|------|
| 数据库（SQLite） | 前端 `api.ts` | 通过 tauri-plugin-sql 直连，笔记/分类/标签 CRUD |
| 文件系统 | Rust `file_commands.rs` | 附件读写、外部目录扫描、文件导入，不受插件 scope 限制 |
| 业务组装 | 前端 `api.ts` | 如文件空间统计 = Rust 扫文件 + SQL 查引用关系 |

### Tauri 命令 (invoke)

| 命令 | 用途 |
|------|------|
| `save_local_file` / `save_local_file_by_name` | 保存附件到应用数据目录 |
| `read_file_as_base64` | 读文件为 data URI（支持 `amnote-data/` 相对路径） |
| `read_text_file` | 读文本文件内容（导入用，限 10MB UTF-8） |
| `copy_file_to_attachments` | 复制外部文件到附件目录（冲突检测/覆盖） |
| `get_all_files` / `get_file_path` | 附件列表 / 路径解析 |
| `delete_file` / `preview_unused_files` | 附件删除 / 未引用预览 |
| `scan_external_dirs` | 扫描外部目录（树形结构，深度限制） |
| `read_external_file` / `save_external_file` | 外部文本文件读写 |
| `open_external_file` | 系统默认程序打开外部文件 |
| `create_external_dir/file` / `delete_external_dir/file` | 外部目录/文件增删 |
| `set_current_viewing_path` / `get_current_viewing_path` | 外部文件查看路径 |

### 自定义协议

| 协议 | 用途 |
|------|------|
| `amnote://files/xxx` | 应用附件（`amnote-data/files/`），由 Rust 协议处理器直接返回 |
| `amnote://local/xxx` | 外部文件绝对路径图片，前端在 `ExternalFilePreview.vue` 中经 `readFileAsBase64` 异步替换为 data URI |

### 路由

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

### 关键设计

- **笔记存储**：Markdown 格式存 SQLite，`markdown-it` 渲染 + highlight.js 代码高亮；HTML 文件按 `content_type` 区分
- **附件存储**：应用数据目录 `amnote-data/files/`，通过 `amnote://files/` 协议引用；文件空间页统计引用关系（未被引用可清理）
- **外部文件**：侧边栏面板浏览任意目录，支持预览文本/图片/Markdown、系统程序打开
- **文件导入**：菜单选择或从 OS 拖文件到分类上——图片复制到附件目录，文本读取内容创建笔记
  - 注意：Tauri 中拖入的 HTML5 `File` 对象无 `path` 属性（Electron 特性），必须用窗口级 `onDragDropEvent` 获取真实路径（见 `AppSidebar.vue`）
- **窗口配置**：默认 1400x900，最小 1000x600，居中显示
