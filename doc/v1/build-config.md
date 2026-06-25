# NoteMaster 配置与构建

## 开发环境

### 前置要求
- Node.js >= 18
- npm

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 类型检查
```bash
npm run typecheck
```

### 代码 lint
```bash
npm run lint
```

## 构建与打包

### 仅编译（不打包）
```bash
npm run build
```
输出到 `out/` 和 `dist/` 目录。

### 打包为可执行文件（便携版）
```bash
npm run package
```
生成未安装的 exe 文件到 `output-exe-{timestamp}/` 目录。

### 打包为 NSIS 安装包
```bash
npm run package:installer
```
生成 `.exe` 安装程序，支持自定义安装路径。

### 清理构建产物
```bash
npm run clean:build
```
删除 `out/` 和 `dist/` 目录。

## electron-builder 配置

配置文件：`electron-builder.yml`

### 关键配置项

| 配置项 | 值 | 说明 |
|--------|-----|------|
| appId | com.notemaster.app | 应用唯一标识 |
| productName | NoteMaster | 应用名称 |
| output | ${env.BUILD_OUTPUT} | 输出目录（由环境变量控制） |
| asar | true | 使用 asar 打包 |
| asarUnpack | sql.js, ssh2-sftp-client, ssh2, cpu-features, buildcheck | 原生模块不解压 |
| win.target | nsis | Windows 安装包格式 |
| nsis.oneClick | false | 允许选择安装路径 |
| nsis.allowToChangeInstallationDirectory | true | 自定义安装目录 |

### Electron 镜像
使用国内镜像加速下载：
```yaml
electronDownload:
  mirror: https://npmmirror.com/mirrors/electron/
```

## 项目结构配置

### electron.vite.config.ts
- **main/preload**：使用 `externalizeDepsPlugin()` 外部化依赖
- **renderer**：配置路径别名 `@/` 和 `@shared/`

### tsconfig.json
- 目标：ES2022
- 模块：ESNext
- 路径映射：`@/*` → `src/renderer/*`，`@shared/*` → `src/shared/*`

## 数据库

- **引擎**：sql.js (SQLite WASM)
- **路径**：`%APPDATA%/notemaster/notemaster.db`
- **WASM 定位**：开发环境和打包后路径不同，由 `locateWasm()` 函数处理

## 资源文件

- `resources/icon.png`：应用图标（托盘、窗口、安装包）
- `extraResources`：打包时复制到 `resources/` 目录

## 环境变量

打包脚本通过 `BUILD_OUTPUT` 环境变量控制输出目录名称，格式为 `output-exe-{timestamp}`。
