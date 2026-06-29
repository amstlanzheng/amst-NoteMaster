# 代码清理

## 变更概述

移除未使用代码、修正命名不一致、清理调试功能。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `.gitignore` | 添加 `package/` 目录（Element Plus 编译产物） |
| `build.ps1` | 4 处 `NoteMaster` 替换为 `AmNote` |
| `src/main/ipc.ts` | 移除 `file:add-external-files`、`file:add-external-folder`、`file:get-external-files`、`file:debug-all-files`、`file:delete-external-file` 共 5 个 IPC handler |
| `src/preload/index.ts` | 移除 `addExternalFiles`、`addExternalFolder`、`getExternalFiles`、`debugAllFiles`、`deleteExternalFile` 共 5 个 API |
| `src/renderer/components/layout/AppSidebar.vue` | 移除 `debugExternalFiles` 函数和调试按钮；移除 `deleteExternalFileRecord` 函数和 `@delete` 事件 |
| `src/renderer/components/layout/ExternalFileTree.vue` | 移除 `delete` 事件声明、递归传递、两处删除按钮 |
| `src/main/database.ts` | `initTables` 末尾添加 `DELETE FROM external_files` 清理孤立数据 |

## 清理说明

### external_files 表死代码

`external_files` 表的增删查功能（5 个 IPC）在渲染进程中无任何 UI 调用入口，属于早期开发遗留。当前外部文件功能改为直接扫描文件系统（`scanExternalDirs`），不再依赖该表。

保留表结构（避免迁移问题），启动时自动清理数据。

### 调试按钮

侧边栏外部文件区域的红色 🔍 按钮仅用于开发调试（显示数据库记录数），已移除。

### 命名修正

`build.ps1` 中 `NoteMaster` 为旧项目名，统一改为 `AmNote`。
