# MinIO 对象存储支持

## 变更概述

新增 MinIO 对象存储模式，图片可上传到 MinIO 服务器，Markdown 中引用 HTTP URL。设置页提供 MinIO 配置和测试连接功能。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `src/shared/types.ts` | `ImageStorageMode` 新增 `'minio'`；新增 `MinioConfig` 接口 |
| `src/main/ipc.ts` | 新增 `minio:test-connection` 和 `minio:upload` IPC handler |
| `src/preload/index.ts` | 新增 `testMinioConnection(config)` 和 `uploadToMinio(data)` API |
| `src/renderer/views/SettingsView.vue` | 图片存储方式新增 MinIO 选项（卡片式布局）；MinIO 配置卡片（服务地址/端口/Access Key/Secret Key/Bucket/路径前缀/SSL） |
| `src/renderer/components/editor/MdEditor.vue` | 粘贴图片时支持 MinIO 上传模式，10MB 大小限制 |

## 依赖

```json
"minio": "^8.0.0"
```

## 功能详情

### 存储方式设置

三种模式卡片式选择：
- **Base64 嵌入**：图片转 Base64 直接嵌入 Markdown
- **文件夹存储（推荐）**：图片保存到本地 amnote-data/files/
- **MinIO 对象存储**：图片上传到 MinIO 服务器，Markdown 引用 URL

### MinIO 配置

| 配置项 | 说明 |
|--------|------|
| endPoint | MinIO 服务地址（如 minio.example.com） |
| port | 端口（默认 9000） |
| accessKey | 访问密钥 |
| secretKey | 秘密密钥 |
| bucket | 存储桶名称 |
| pathPrefix | 对象路径前缀（如 images） |
| useSSL | 是否启用 SSL |

### 测试连接

点击「测试连接」验证：
1. Bucket 是否存在
2. 是否有列出对象权限
3. 返回成功/失败消息

### 上传流程

```typescript
// MdEditor.vue
const minioConfig = JSON.parse(localStorage.getItem('amnote-minio-config'))
const result = await window.api.uploadToMinio({
  buffer, filename, noteId, config: minioConfig
})
// result.path = "http://minio.example.com:9000/amnote/images/note_1_1234567.png"
```

MinIO 模式文件大小限制 10MB（其他模式 1MB）。
