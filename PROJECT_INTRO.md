# AmNote 项目简介

> 一款基于 **Tauri 2 + Vue 3** 的本地优先（Local-First）桌面笔记应用：Markdown 笔记、分类标签、全文搜索、附件与外部文件管理，内置多模型 AI 助手，数据全部存放在本地，不依赖云端服务。

## 一、项目定位

| 维度 | 说明 |
|------|------|
| 产品形态 | 跨平台桌面应用（Windows / macOS / Linux） |
| 数据归属 | 完全本地：SQLite 数据库 + 应用数据目录中的文件系统 |
| 核心场景 | 个人知识管理、Markdown 写作、本地文件整理与 AI 辅助编辑 |
| 技术路线 | Tauri 2（Rust 后端）+ Vue 3（前端），产物体积小、启动快 |

## 二、核心功能

- **笔记管理**：Markdown 笔记的新建 / 编辑 / 收藏 / 删除与回收站，`markdown-it` 渲染 + highlight.js 代码高亮
- **分类与标签**：多级分类树、标签体系，支持右键菜单操作（新建 / 重命名 / 移动 / 删除）
- **搜索与统计**：全文搜索、全局搜索弹窗、笔记与标签使用统计（ECharts 图表）
- **附件与文件空间**：附件统一存放在应用数据目录，通过 `amnote://files/` 自定义协议引用；文件空间页统计引用关系并支持清理未引用文件
- **外部文件浏览**：侧边栏直接浏览本地任意目录，支持文本 / 图片 / Markdown 预览、重命名、移动、删除，也可调用系统默认程序打开
- **文件导入**：菜单选择或从操作系统拖拽文件到分类——图片复制进附件目录，文本读取内容生成笔记
- **AI 助手**：三栏布局（外部文件树 / 文件编辑与格式化 / 对话），多模型、多会话、流式输出，可由 AI 输出结构化动作指令（写 / 删 / 改名 / 移动文件），经用户确认后执行

## 三、技术栈

| 层级 | 技术选型 |
|------|----------|
| 桌面框架 | Tauri 2（Rust） |
| 前端框架 | Vue 3 + TypeScript + Vite 7 |
| UI 组件库 | Element Plus |
| 状态管理 | Pinia |
| 路由 | Vue Router 4（Hash 模式） |
| 数据库 | SQLite（`tauri-plugin-sql`，前端直连） |
| Markdown | markdown-it + highlight.js |
| 图表 | ECharts（vue-echarts） |
| AI 对话 | Rust `reqwest` 转发 OpenAI 兼容 SSE，事件分片回传前端 |

## 四、架构概览

```
┌──────────────────────── 前端 (Vue 3 / TS) ────────────────────────┐
│  views 页面  ·  components 组件  ·  stores (Pinia)  ·  api.ts 封装 │
└───────────┬───────────────────────────────┬───────────────────────┘
            │ tauri-plugin-sql (直连)        │ invoke 命令 / 事件
            ▼                               ▼
     SQLite（笔记/分类/标签）      Rust 后端 (src-tauri)
                                    · file_commands.rs  文件读写 / 扫描 / 外部文件
                                    · ai_commands.rs    流式对话 / 中断 / 连通性测试
                                    · amnote:// 自定义协议
```

| 职责 | 实现位置 | 说明 |
|------|----------|------|
| 数据 CRUD | 前端 `src/api.ts` | 经 `tauri-plugin-sql` 直连 SQLite |
| 文件系统 | Rust `file_commands.rs` | 附件与外部文件操作，不受前端插件 scope 限制 |
| 业务组装 | 前端 `src/api.ts` | 例如文件空间统计 = Rust 扫描文件 + SQL 查询引用关系 |
| AI 转发 | Rust `ai_commands.rs` | 请求转发与 SSE 解析，逐块以 `ai-chunk` / `ai-done` / `ai-error` 事件推送 |

## 五、目录结构（精简）

```
AmNoteTauri/
├── src/                      # 前端
│   ├── api.ts                # SQL + Tauri 命令 + 业务组装封装
│   ├── views/                # 首页/收藏/标签/搜索/回收站/统计/文件空间/AI 助手/设置
│   ├── components/           # layout / editor / note / common / ai
│   ├── stores/               # Pinia：category / note / noteTree / tag / search / ui / ai
│   ├── composables/          # 右键菜单逻辑
│   └── utils/                # markdown 渲染、文件格式化、通用格式化
├── src-tauri/                # Rust 后端
│   ├── src/lib.rs            # 插件与命令注册、amnote:// 协议
│   ├── src/file_commands.rs  # 文件相关命令
│   ├── src/ai_commands.rs    # AI 对话命令
│   └── tauri*.conf.json      # 主配置 + 各平台打包覆盖
└── scripts/build-portable.mjs # 跨平台免安装包脚本
```

## 六、快速开始

前置环境：Node.js >= 20.11、Rust（rustup）、Windows 需安装 MSVC 生成工具。

```bash
git clone <repo-url> -b tauri   # 代码位于 tauri 分支
cd AmNoteTauri
npm install
npm run tauri dev               # 开发模式（Vite HMR + Rust 自动重编译）
```

| 命令 | 用途 |
|------|------|
| `npm run tauri dev` | 开发模式（热更新） |
| `npm run build` | 仅构建前端到 `dist/` |
| `npm run build:portable` | 生成免安装包到 `output-时间戳/`，跨平台推荐 |
| `npm run build:win` | 按平台生成安装包（Windows → NSIS） |

## 七、设计要点

- **本地优先**：无账号体系与云同步，数据库与附件均落在本机应用数据目录
- **前后端边界清晰**：数据走前端 SQL 插件，文件与网络请求走 Rust 命令，业务组装集中在前端 `api.ts`
- **自定义协议**：`amnote://files/` 由 Rust 协议处理器直接返回附件；`amnote://local/` 在预览时异步替换为 data URI
- **AI 动作可控**：AI 只输出 `amnote-action` 代码块，前端解析为确认卡片，用户确认后才真正调用文件命令
- **打包约束**：必须使用 `tauri build`（CLI 负责嵌入前端资源），裸 `cargo build --release` 会导致运行时找不到前端资源

## 八、分支与版本

| 项 | 说明 |
|----|------|
| 当前版本 | 1.0.0 |
| 主分支 | `tauri`（现行 Tauri 版本）；`master` 为旧 Electron 版本 |
| 许可 | 未在仓库中声明 LICENSE，如需开源分发请先补充 |

> 更详细的命令说明、打包排错与接口清单见 [README.md](README.md)。
