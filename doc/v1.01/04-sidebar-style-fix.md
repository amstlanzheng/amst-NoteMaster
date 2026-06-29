# 侧边栏样式修复

## 变更概述

修复侧边栏"日期归档"和"标签"区域标题贴边的问题。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/renderer/components/layout/AppSidebar.vue` | 日期归档、标签、收藏分类的 `<div class="section-title">` 改为 `<div class="section-header"><span class="section-title">...</span></div>`；新增 `.sidebar-section { padding: 0 4px; }` |

## 问题原因

分类区域使用了 `section-header`（有 `padding: 16px 12px 8px`），而日期归档和标签区域直接用了 `section-title`（只有文字样式，没有内边距），导致标题和内容贴边。

## 修复方式

统一使用 `section-header` 包裹 `section-title`，与分类区域保持一致的间距。
