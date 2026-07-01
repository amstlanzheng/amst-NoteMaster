# 外部文件 Markdown 相对路径图片显示

## 变更概述

外部文件预览中，Markdown 里的相对路径图片（如 `![alt](images/xxx.png)`）无法显示。修复为基于当前文件目录解析相对路径，通过自定义协议加载。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/renderer/utils/markdown.ts` | `renderMarkdown` 新增 `baseDir` 参数；图片渲染规则增加相对路径解析，使用 `amnote://local/` 协议 |
| `src/renderer/views/ExternalFilePreview.vue` | `renderedMarkdown` 传入 `baseDir`（当前文件目录） |
| `src/main/window.ts` | 扩展 `amnote://` 协议，新增 `local/` 路径类型映射任意本地文件 |

## 问题

外部 Markdown 文件中的 `![Hermes Desktop 模型配置](images/hermes%20desktop模型配置.png)` 图片无法显示，因为：

1. 渲染器不知道文件所在目录，无法解析相对路径
2. 即使解析了路径，`file:///` 协议在 Electron 渲染进程中受同源策略限制

## 修复

### 1. renderMarkdown 支持 baseDir

```typescript
export function renderMarkdown(content: string, baseDir?: string): string {
  currentBaseDir = baseDir || ''
  try {
    return md.render(content || '')
  } finally {
    currentBaseDir = ''
  }
}
```

### 2. 图片渲染规则扩展

在自定义图片渲染规则中，当 `baseDir` 存在且图片路径为相对路径时：

- `decodeURIComponent` 解码 URL 编码（如 `%20` → 空格）
- 基于 `baseDir` 解析相对路径（支持 `../`、`./`）
- 绝对路径直接使用
- 转换为 `amnote://local/` 协议 URL

### 3. amnote:// 协议扩展

```
amnote://files/xxx.png     → {userData}/amnote-data/files/xxx.png  （原有）
amnote://local/D:/xxx.png  → D:/xxx.png                           （新增）
```

`local/` 前缀后的路径直接作为本地文件路径，用于加载外部 Markdown 文件引用的图片。

### 路径解析示例

当前文件：`D:/book/1.课件/01-入门篇.md`

| Markdown 图片路径 | 解析结果 |
|---|---|
| `images/xxx.png` | `D:/book/1.课件/images/xxx.png` |
| `../images/xxx.png` | `D:/book/images/xxx.png` |
| `./images/xxx.png` | `D:/book/1.课件/images/xxx.png` |
| `D:/assets/xxx.png` | `D:/assets/xxx.png`（绝对路径直接使用） |
