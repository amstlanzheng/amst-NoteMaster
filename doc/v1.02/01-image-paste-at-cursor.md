# 图片粘贴插入到光标位置

## 变更概述

Base64/文件夹模式粘贴图片时，图片 Markdown 语法追加到内容末尾而非光标位置。修复为在光标位置插入。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/renderer/components/editor/MdEditor.vue` | 新增 `insertAtCursor()` 函数；粘贴图片前保存光标位置，异步完成后在光标位置插入 |

## 问题

`handlePasteImage` 中使用 `editContent.value += mdImg` 将图片追加到内容末尾，无论光标在哪里。

## 修复

1. 在异步操作（Base64 转换/文件保存）前保存光标位置 `cursorPos`
2. 新增 `insertAtCursor(text, pos)` 函数，在指定位置插入文本并恢复光标
3. 替换 `editContent.value += mdImg` 为 `insertAtCursor(mdImg, cursorPos)`

### insertAtCursor 实现

```typescript
function insertAtCursor(text: string, pos: number) {
  const content = editContent.value
  editContent.value = content.slice(0, pos) + text + content.slice(pos)
  nextTick(() => {
    const textarea = document.querySelector('.edit-textarea') as HTMLTextAreaElement
    if (textarea) {
      const newPos = pos + text.length
      textarea.selectionStart = textarea.selectionEnd = newPos
      textarea.focus()
    }
  })
}
```
