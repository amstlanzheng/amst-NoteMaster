# 笔记列表搜索与视图切换

## 变更概述

中间笔记列表新增分类内搜索框和摘要/列表两种展示模式切换。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/renderer/components/note/NoteList.vue` | 新增搜索框（300ms 防抖）；新增视图切换按钮；摘要模式显示标题+预览+标签+日期，列表模式只显示标题行 |
| `src/renderer/stores/ui.ts` | 新增 `noteViewMode` 状态（`'summary' | 'list'`），持久化到 localStorage |
| `src/main/ipc.ts` | 新增 `collectSubCategoryIds()` 递归收集子分类 ID，`db:get-notes` 支持 `include_subcategories` 筛选 |
| `src/shared/types.ts` | `FilterOptions` 新增 `include_subcategories` 字段 |

## 功能详情

### 分类内搜索

- 搜索框位于列表头部下方
- 输入关键词后 300ms 防抖触发搜索
- 搜索时自动设置 `include_subcategories: true`，搜索当前分类及所有子分类
- 切换分类时自动清空搜索词

### 视图切换

- **摘要模式**：卡片样式，显示文档图标 + 标题 + 预览内容 + 标签 + 日期
- **列表模式**：紧凑样式，显示小图标 + 标题，适合快速浏览大量笔记
- 切换状态持久化到 localStorage
