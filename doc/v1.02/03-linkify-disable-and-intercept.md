# Markdown 链接识别与跳转优化

## 变更概述

1. 禁用 markdown-it 的 linkify 自动链接识别，防止 `.md` 文件名被误识别为 URL
2. 拦截预览面板链接点击，`.md` 文件在应用内跳转预览，外部链接用系统浏览器打开
3. 修复中文路径 URL 编码问题

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/renderer/utils/markdown.ts` | `linkify: false`；自定义 `link_open` 渲染规则添加 `target="_blank"` |
| `src/renderer/components/editor/MdEditor.vue` | 预览面板添加 `handlePreviewClick` 事件拦截；引入 `useRouter` |
| `src/renderer/views/ExternalFilePreview.vue` | Markdown 预览添加链接点击拦截；`.md` 链接应用内跳转；引入 `useRouter` |

## 1. 禁用 linkify

### 问题

markdown-it 的 `linkify: true` 会将 `AGENTS.md` 等文件名自动识别为链接，点击后跳转到 `https://agents.md/`，无法返回。

### 修复

将 `linkify` 配置改为 `false`，不再自动将纯文本 URL 转为链接。用户手动写的 `[text](url)` 格式链接仍正常渲染。

## 2. 链接点击拦截

### 问题

预览面板中的链接点击会导致 Electron 应用内导航，用户无法返回。

### 修复

在预览面板添加 `click` 事件监听，拦截 `<a>` 标签点击：

- **`.md`/`.markdown` 链接**：在应用内跳转到 ExternalFilePreview 页面预览
  - ExternalFilePreview 中基于当前文件目录解析相对路径
  - MdEditor 中直接使用 href 路径
- **其他链接**：`window.open()` 打开，由 Electron `setWindowOpenHandler` 拦截后用系统浏览器打开

### 路径解析（ExternalFilePreview）

```typescript
// 基于当前文件目录解析相对路径
const currentDir = filePath.value.substring(0, filePath.value.replace(/\\/g, '/').lastIndexOf('/'))
// 支持 ../ 和 ./ 相对路径
// 支持 / 开头的绝对路径
// 支持 Windows 盘符绝对路径
```

## 3. 中文路径 URL 编码修复

### 问题

markdown-it 渲染时对 href 进行 URL 编码，如 `01-入门篇.md` 变为 `01-%E5%85%A5%E9%97%A8%E7%AF%87.md`，导致文件找不到。

### 修复

在链接点击处理中使用 `decodeURIComponent(anchor.getAttribute('href'))` 解码，还原中文路径。
