# Ctrl+S 快捷键保存

## 变更概述

为笔记编辑器和外部文件预览添加 Ctrl+S 快捷键，支持立即保存。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/renderer/components/editor/MdEditor.vue` | 添加 `handleKeyDown` 监听 Ctrl+S，取消自动保存定时器并立即保存 |
| `src/renderer/views/ExternalFilePreview.vue` | 添加 `handleKeyDown` 监听 Ctrl+S，编辑模式下直接保存文件（不弹确认框） |

## 问题

编辑器只有 2 秒防抖自动保存，用户无法手动触发立即保存。

## 修复

### MdEditor（笔记编辑器）

- 监听 `window` 的 `keydown` 事件
- `Ctrl+S` / `Cmd+S` 时：取消自动保存定时器 → 立即执行 `doAutoSave()` → 提示"已保存"
- `onMounted` 绑定，`onUnmounted` 解绑

### ExternalFilePreview（外部文件预览）

- 仅在编辑模式且有修改时响应 Ctrl+S
- 直接保存文件，不弹出确认对话框（与按钮保存不同）
- 保存成功后更新 `originalContent` 并清除修改标记

```typescript
function handleKeyDown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault()
    // 立即保存逻辑
  }
}
```
