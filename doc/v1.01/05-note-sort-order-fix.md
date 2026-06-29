# 笔记查看时排序变化修复

## 变更概述

修复点击笔记查看时触发不必要的 `updated_at` 更新，导致笔记排序位置变化的问题。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/renderer/components/editor/MdEditor.vue` | 添加 `isNoteSwitching` 标志，切换笔记时跳过自动保存触发 |
| `src/main/ipc.ts` | `db:update-note` 只在 `title` 或 `content` 变更时才更新 `updated_at` |

## 问题根因

1. **前端**：切换笔记时 `watch(currentNote)` 触发 → 给 `editTitle`/`editContent` 赋值 → 触发 `watch([editTitle, editContent])` → 2s 后 `doAutoSave()` → 调用 `updateNote`
2. **后端**：`db:update-note` 无条件设置 `updated_at = datetime('now','localtime')`，即使只改了 `is_favorite`/`is_pinned`

## 修复方式

### 前端：isNoteSwitching 标志

```typescript
const isNoteSwitching = ref(false)

watch(() => noteStore.currentNote, (note) => {
  if (note) {
    isNoteSwitching.value = true
    editTitle.value = note.title || ''
    editContent.value = note.content || ''
    // ...
    nextTick(() => { isNoteSwitching.value = false })
  }
}, { immediate: true })

watch([editTitle, editContent, contentType], () => {
  if (isNoteSwitching.value) return  // 切换笔记时跳过
  triggerAutoSave()
})
```

### 后端：条件更新 updated_at

```typescript
// 只有内容变更才更新 updated_at
if (data.title !== undefined || data.content !== undefined) {
  fields.push("updated_at = datetime('now','localtime')")
}
```

收藏/置顶等操作不再改变 `updated_at`，不影响排序。
