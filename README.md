# AmNote (Tauri)

基于 Tauri 2 + Vue 3 的本地笔记管理应用。Markdown 笔记、分类/标签管理、全文搜索、外部文件浏览与导入，内置 AI 助手（多模型 / 多会话 / 流式对话 + 文件读写），数据完全本地存储（SQLite + 文件系统）。

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
| AI 对话 | Rust `reqwest` 流式转发（OpenAI 兼容 SSE），前端经事件接收分片 |

## 快速开始

### 前置环境（新机器只需安装一次）

| 依赖 | 说明 | 验证 |
|------|------|------|
| Node.js >= 20.11 | 前端构建（打包脚本使用 `import.meta.dirname`，需 20.11+） | `node -v` |
| Rust (rustup) | 后端编译 | `cargo -v` |
| MSVC 生成工具 | Windows 编译 Rust 必需（Visual Studio Build Tools → "C++ 生成工具"工作负荷） | — |

### 拉取代码后运行

```bash
git clone <repo-url> -b tauri
cd AmNoteTauri
npm install        # 安装前端依赖（含 Tauri CLI）
npm run tauri dev  # 启动开发模式
```

> **分支说明**：本项目代码位于 `tauri` 分支（`master` 为旧的 Electron 版本），克隆时须指定 `-b tauri`。
>
> 首次 `cargo build` 需联网下载 crates.io 依赖；网络受限可配置国内镜像（如 rsproxy）。

### 开发模式说明

- Vite 开发服务器：`http://localhost:1420`（支持 HMR）
- Rust 后端自动编译并弹出应用窗口
- 前端改动即时热更新，Rust 改动自动重编译

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm run tauri dev` | 开发模式（热更新） |
| `npm run dev` | 仅启动前端 Vite 服务（浏览器调试，无 Rust 后端能力） |
| `npm run build` | 仅构建前端到 `dist/` |
| `npm run build:portable` | **免安装包**（推荐，跨平台），输出 `output-YYYYMMDD-HHmmss/`：Windows→`amnote-tauri.exe`、Linux→`amnote-tauri`、macOS→`AmNote.app` |
| `npm run build:win` | 打包安装包（按平台：Windows→NSIS、macOS→app+dmg、Linux→deb+AppImage），输出到 `src-tauri/target/release/bundle/` |

## 打包

### 免安装包（推荐，跨平台）

```bash
npm run build:portable
```

脚本 `scripts/build-portable.mjs` 会**按当前平台自动选择构建方式**，并把产物收集到 `output-YYYYMMDD-HHmmss/`：

| 平台 | 构建命令 | 产物 | 说明 |
|------|----------|------|------|
| Windows | `tauri build --no-bundle` | `amnote-tauri.exe` | 单文件，双击即用 |
| Linux | `tauri build --no-bundle` | `amnote-tauri` | 单文件（已设可执行权限），依赖系统 WebKitGTK 运行库 |
| macOS | `tauri build --bundles app` | `AmNote.app` | 应用包，拖入「应用程序」即可 |

- 为何 macOS 不同：macOS 的 GUI 程序必须是 `.app` 结构（Info.plist / icns 图标），裸二进制不算可分发产物，所以要经一次 bundler
- 前端资源由 Tauri 嵌入产物，**全程无需联网**，适合国内网络环境
- macOS 产物未签名 / 未公证，其它机器首次打开需 右键 → 打开（或 `xattr -dr com.apple.quarantine AmNote.app`）

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

### 其它平台（macOS / Linux）

打包目标按平台拆分在 `src-tauri/tauri.<平台>.conf.json`，Tauri 会与主配置 `tauri.conf.json` **合并**后生效：

| 平台 | 平台配置文件 | 打包目标 | 产物 |
|------|--------------|----------|------|
| Windows | `tauri.windows.conf.json` | nsis | `bundle/nsis/*-setup.exe` |
| macOS | `tauri.macos.conf.json` | app, dmg | `bundle/macos/AmNote.app`、`bundle/dmg/*.dmg` |
| Linux | `tauri.linux.conf.json` | deb, appimage | `bundle/deb/*.deb`、`bundle/appimage/*.AppImage` |

- 在对应平台执行 `npm run tauri build` 即按该平台目标打包，**无需改配置**（需要安装器形式产物时用它；只想要免安装包则用 `npm run build:portable`）
- macOS 打包依赖 `icons/icon.icns`（已加入 `bundle.icon` 列表）；Linux 的 AppImage 目标首次构建需联网下载打包工具

### 打包注意事项

1. **禁止裸 `cargo build --release` 打包**：直接 cargo 编译的 exe 不会嵌入前端资源，运行时会去连 devUrl `http://localhost:1420` 报 `ERR_CONNECTION_REFUSED`。必须用 `tauri build --no-bundle`（由 Tauri CLI 完成资源嵌入）。
2. **`[[bin]]` 声明**：`src-tauri/Cargo.toml` 中必须保留 `[[bin]]` 配置，否则只编译库不生成 exe。
3. **chunk 体积警告**：Vite 提示部分 chunk 超过 500kB 属正常（echarts / markdown-it 体积大），不影响功能。
4. **Tauri JS / Rust 版本必须同 minor**：`package.json` 中的 `@tauri-apps/api`、`@tauri-apps/plugin-*` 已按 `src-tauri/Cargo.lock` 的 Rust crate 版本**精确锁定**（不带 `^`）。CLI 会在 `tauri build` 时强校验，不一致会直接报错终止（`tauri dev` 仅警告）。升级时两侧需同步：先改 Rust 侧依赖并构建，再把 JS 侧锁到对应版本。

## 项目结构

```
AmNoteTauri/
├── src/                        # 前端源码
│   ├── api.ts                  # window.api 封装（SQL + Tauri 命令调用 + 业务组装）
│   ├── main.ts                 # 入口（注册 Element Plus 与全局图标）
│   ├── router/index.ts         # 路由配置
│   ├── stores/                 # Pinia：category / note / noteTree / tag / search / ui / ai
│   ├── composables/            # 右键菜单逻辑：useCategoryContextMenu / useNoteContextMenu
│   ├── views/                  # 页面视图
│   │   ├── HomeView.vue        # 首页（笔记列表）
│   │   ├── FavoriteView.vue    # 收藏
│   │   ├── TagView.vue         # 标签
│   │   ├── SearchView.vue      # 搜索
│   │   ├── TrashView.vue       # 回收站
│   │   ├── StatsView.vue       # 统计
│   │   ├── FileSpaceView.vue   # 文件空间（附件管理）
│   │   ├── ExternalFilePreview.vue  # 外部文件预览
│   │   ├── AiAssistantView.vue # AI 助手（左：外部文件 / 中：编辑格式化 / 右：对话）
│   │   └── SettingsView.vue    # 设置
│   ├── components/
│   │   ├── layout/             # AppLayout / AppSidebar / AppTopBar / CategoryTreeItem / ExternalFileTree
│   │   ├── editor/MdEditor.vue # Markdown 编辑器
│   │   ├── note/NoteList.vue   # 笔记列表
│   │   ├── common/             # CategoryContextMenu / NoteContextMenu / GlobalSearchDialog
│   │   └── ai/                 # AiFilePanel / AiFileEditor / AiChatPanel / AiModelDialog
│   ├── utils/
│   │   ├── markdown.ts         # Markdown 渲染 + 图片路径处理（amnote:// 协议）
│   │   ├── fileFormat.ts       # 文件类型识别、格式化与 AI 文件操作协议解析
│   │   └── format.ts           # 日期/大小格式化
│   └── shared/types.ts         # 前后端共享类型
├── src-tauri/                  # Rust 后端
│   ├── Cargo.toml              # 含 [[bin]] 声明（必需）
│   ├── tauri.conf.json         # 窗口/打包/权限配置（跨平台公共部分）
│   ├── tauri.windows.conf.json # 平台覆盖：打包目标 nsis
│   ├── tauri.macos.conf.json   # 平台覆盖：打包目标 app + dmg
│   ├── tauri.linux.conf.json   # 平台覆盖：打包目标 deb + appimage
│   ├── capabilities/default.json  # 权限清单（core / sql / dialog / process）
│   └── src/
│       ├── main.rs             # 入口
│       ├── lib.rs              # 插件注册 + 命令注册 + amnote:// 自定义协议
│       ├── file_commands.rs    # 文件操作命令（读写/扫描/外部文件/导入）
│       └── ai_commands.rs      # AI 对话命令（流式转发 / 中断 / 连通性测试）
├── scripts/
│   └── build-portable.mjs      # 跨平台免安装包脚本（按平台构建并收集产物到 output-时间戳目录）
└── package.json
```

## 架构设计

### 前后端分工

| 职责 | 位置 | 说明 |
|------|------|------|
| 数据库（SQLite） | 前端 `api.ts` | 通过 tauri-plugin-sql 直连，笔记/分类/标签 CRUD |
| 文件系统 | Rust `file_commands.rs` | 附件读写、外部目录扫描与增删改（新建/重命名/移动）、文件导入，不受插件 scope 限制 |
| 业务组装 | 前端 `api.ts` | 如文件空间统计 = Rust 扫文件 + SQL 查引用关系 |
| AI 对话 | Rust `ai_commands.rs` | 前端 invoke 发起请求，Rust 用 reqwest 转发 OpenAI 兼容 SSE，逐块以事件回传前端 |

### Tauri 命令 (invoke)

| 命令 | 用途 |
|------|------|
| `save_local_file` | 保存附件到应用数据目录 |
| `read_file_as_base64` | 读文件为 data URI（支持 `amnote-data/` 相对路径） |
| `read_text_file` | 读文本文件内容（导入/AI 编辑用，限 10MB UTF-8） |
| `copy_file_to_attachments` | 复制外部文件到附件目录（冲突检测/覆盖） |
| `get_all_files` / `get_file_path` / `get_db_path` | 附件列表 / 路径解析 / 数据库路径 |
| `scan_referenced_files` / `preview_unused_files` / `clean_unused_files` | 附件引用扫描 / 未引用预览 / 清理 |
| `delete_file` | 附件删除 |
| `scan_external_dirs` | 扫描外部目录（树形结构，深度限制） |
| `open_external_file` | 系统默认程序打开外部文件 |
| `save_external_file` / `save_external_text` | 外部文件写入（二进制 / 文本） |
| `create_external_dir` / `create_external_file` | 外部目录 / 文件新建 |
| `delete_external_dir` / `delete_external_file` | 外部目录 / 文件删除 |
| `rename_external_path` / `move_external_path` | 外部文件或目录重命名 / 移动 |
| `set_current_viewing_path` / `get_current_viewing_path` | 外部文件查看路径 |
| `ai_chat_stream` / `ai_abort_stream` / `ai_test_connection` | AI 流式对话 / 中断生成 / 连通性测试 |

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
| `/ai-assistant` | AiAssistantView | AI 助手（外部文件 / 编辑格式化 / 对话） |
| `/settings` | SettingsView | 设置 |

### 关键设计

- **笔记存储**：Markdown 格式存 SQLite，`markdown-it` 渲染 + highlight.js 代码高亮；HTML 文件按 `content_type` 区分
- **附件存储**：应用数据目录 `amnote-data/files/`，通过 `amnote://files/` 协议引用；文件空间页统计引用关系（未被引用可清理）
- **外部文件**：侧边栏面板浏览任意目录，支持预览文本/图片/Markdown、系统程序打开
- **文件导入**：菜单选择或从 OS 拖文件到分类上——图片复制到附件目录，文本读取内容创建笔记
  - 注意：Tauri 中拖入的 HTML5 `File` 对象无 `path` 属性（Electron 特性），必须用窗口级 `onDragDropEvent` 获取真实路径（见 `AppSidebar.vue`）
- **窗口配置**：默认 1400x900，最小 1000x600，居中显示
- **AI 助手**：三栏布局（外部文件树 / 文件编辑 / 对话）。模型配置与会话（含消息）持久化在 localStorage；对话由 Rust 转发 SSE，前端通过 `ai-chunk` / `ai-reasoning` / `ai-done` / `ai-error` 事件接收。AI 需修改文件时输出 ` ```amnote-action ` 代码块（JSON：write / delete / rename / move），前端解析为确认卡片，用户点击后才调用文件命令执行；格式化由 `utils/fileFormat.ts` 零依赖实现（JSON / XML / HTML / CSS / C 类语言）
