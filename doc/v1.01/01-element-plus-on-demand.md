# Element Plus 按需引入优化

## 变更概述

将 Element Plus 从全量引入改为按需引入，减小打包体积。

## 变更文件

| 文件 | 变更内容 |
|------|----------|
| `electron.vite.config.ts` | 添加 `unplugin-auto-import` 和 `unplugin-vue-components` 插件，配置 `ElementPlusResolver` |
| `src/renderer/main.ts` | 将 `import * as ElementPlusIconsVue` 全量导入替换为仅导入项目实际使用的 28 个图标组件 |
| `package.json` | 新增 `unplugin-vue-components`、`unplugin-auto-import` 开发依赖 |

## 技术细节

### 自动按需导入（模板中的 el-xxx 组件）

通过 `unplugin-vue-components` + `ElementPlusResolver`，模板中使用的 `<el-button>`、`<el-input>` 等组件会自动按需导入，无需手动注册。

### 图标手动按需注册

图标组件无法被自动解析，仍需手动注册。从全量注册（280+ 图标）缩减为项目实际使用的 28 个：

```
Loading, Folder, Document, Top, StarFilled, Edit, Download, Delete,
Close, View, Picture, Bottom, Search, Sunny, Moon, FolderAdd,
ArrowDown, ArrowRight, Calendar, Star, Brush, Plus, Upload,
CollectionTag, DataAnalysis, Setting, FolderOpened, DocumentAdd
```

### 新增依赖

```bash
npm install -D unplugin-vue-components unplugin-auto-import
```

## 效果

- 打包时 Element Plus 组件按需 tree-shake
- 图标注册从 280+ 减少到 28 个
- 渲染进程入口文件体积减小
