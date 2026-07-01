# 分类切换时清除编辑器内容

## 变更概述

点击左侧分类文件夹、标签、日期归档时，右侧编辑器仍显示之前选中的笔记内容。修复为切换时清除选中笔记。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/renderer/components/layout/AppSidebar.vue` | `selectCategory`、`selectTag`、`selectNoTag`、`selectArchive` 中添加 `noteStore.currentNote = null` |
| `src/renderer/components/note/NoteList.vue` | `enterSubCategory` 中添加 `noteStore.currentNote = null` |

## 问题

点击分类文件夹后，中间笔记列表正确刷新，但右侧编辑器仍显示之前选中的笔记，造成内容与分类不匹配的困惑。

## 修复

在所有切换筛选条件的入口处，将 `noteStore.currentNote` 置为 `null`，使编辑器回到未选中状态（无内容显示）。

### 涉及的函数

| 组件 | 函数 | 触发场景 |
|------|------|----------|
| AppSidebar | `selectCategory` | 点击分类文件夹 |
| AppSidebar | `selectTag` | 点击标签 |
| AppSidebar | `selectNoTag` | 点击"无标签" |
| AppSidebar | `selectArchive` | 点击日期归档 |
| NoteList | `enterSubCategory` | 点击子分类文件夹 |
