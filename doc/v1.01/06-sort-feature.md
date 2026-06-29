# 笔记排序功能

## 变更概述

新增笔记排序方式切换，支持按更新时间、创建时间、自定义权重排序。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/main/database.ts` | `notes` 表新增 `sort_weight INTEGER DEFAULT 999` 列；迁移逻辑兼容已有数据库 |
| `src/main/ipc.ts` | `getNotes` 支持 `sort_by`/`sort_order` 参数；新增 `db:update-note-weight` IPC |
| `src/preload/index.ts` | 新增 `updateNoteWeight` API |
| `src/shared/types.ts` | `Note` 增加 `sort_weight`；`FilterOptions` 增加 `sort_by`/`sort_order` |
| `src/renderer/stores/ui.ts` | 新增 `noteSortBy`/`noteSortOrder` 状态，持久化到 localStorage |
| `src/renderer/stores/note.ts` | `fetchNotes` 自动注入排序参数 |
| `src/renderer/components/note/NoteList.vue` | 排序下拉菜单、右键"设置权重"、权重标签显示；排序逻辑移至后端 |

## 排序规则

排序优先级：**置顶 > 权重 > 时间**

| 排序方式 | SQL ORDER BY |
|---------|-------------|
| 更新时间 新→旧 | `is_pinned DESC, updated_at DESC` |
| 更新时间 旧→新 | `is_pinned DESC, updated_at ASC` |
| 创建时间 新→旧 | `is_pinned DESC, created_at DESC` |
| 创建时间 旧→新 | `is_pinned DESC, created_at ASC` |
| 自定义权重 | `is_pinned DESC, sort_weight ASC, updated_at DESC` |

## UI 交互

- **排序切换**：笔记列表头部下拉菜单，5 种排序方式
- **设置权重**：右键笔记 → "设置权重"，输入整数（越小越靠前）
- **权重显示**：权重排序模式下，笔记卡片显示 `W:数字` 标签
- **默认权重**：999（新笔记默认排在后面）
- **持久化**：排序偏好保存到 localStorage

## 数据库迁移

已有数据库自动执行 `ALTER TABLE notes ADD COLUMN sort_weight INTEGER DEFAULT 999`，无需手动操作。
