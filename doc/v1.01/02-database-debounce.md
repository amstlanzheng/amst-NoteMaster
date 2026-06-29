# 数据库防抖写入优化

## 变更概述

数据库 `run()` 操作从每次同步写盘改为 300ms 防抖写入，减少高频操作时的 I/O 开销。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/main/database.ts` | 新增 `debouncedSaveDb()` 和 `flushSaveDb()`；`run()` 改用防抖写入；`initTables()` 包裹事务；导出 `flushSaveDb` |
| `src/main/index.ts` | `before-quit` 事件中调用 `flushSaveDb()` 确保退出前数据持久化 |
| `src/main/ipc.ts` | 移除未使用的 `saveDb` 导入 |

## 技术细节

### 防抖机制

```
run() → debouncedSaveDb() → 300ms 内无新操作 → saveDb() → 写盘
```

- `debouncedSaveDb()`: 300ms 防抖，高频调用时只执行最后一次
- `flushSaveDb()`: 立即写盘并取消待执行的防抖，用于关键场景
- `saveDb()`: 实际写盘函数（不变）

### 事务优化

`initTables()` 中的建表和初始数据插入包裹在 `BEGIN TRANSACTION` / `COMMIT` 中，初始化时只写盘一次。

### 退出保障

应用退出时 `before-quit` 事件调用 `flushSaveDb()`，确保防抖中未写入的数据不会丢失。

## 影响范围

- 笔记编辑自动保存（2s 防抖 + 300ms 数据库防抖）
- 分类/标签增删改
- 所有 `run()` 调用均受影响
- `getAll()`/`getOne()` 不受影响（只读操作）
