# 导航历史：返回上级分类与上一个笔记

## 变更概述

笔记列表标题区域新增「返回上级分类」和「返回上一个笔记」导航按钮。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/renderer/stores/category.ts` | 新增 `getParentCategoryId()` 递归查找父分类 ID |
| `src/renderer/stores/note.ts` | 新增 `noteHistory` 数组，`watch(currentNote)` 自动记录切换前的笔记 ID，`goBackNote()` 弹出并返回上一个 |
| `src/renderer/components/note/NoteList.vue` | 标题左侧新增 ArrowUp（返回上级）和 ArrowLeft（返回上一个笔记）按钮 |
| `src/renderer/main.ts` | 注册 `ArrowUp`、`ArrowLeft` 图标 |

## 功能详情

### 返回上级分类

- 当选中了有父分类的子分类时，显示向上箭头按钮
- 点击后导航到父分类，同时更新笔记列表
- 父分类是根级（`null`）则回到「全部笔记」视图

### 返回上一个笔记

- 当之前查看过其他笔记时，显示左箭头按钮
- 点击后回到上一个查看的笔记
- 通过 `watch(currentNote)` 自动记录历史，无需手动管理
