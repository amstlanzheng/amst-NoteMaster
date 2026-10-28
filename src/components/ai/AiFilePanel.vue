<script setup lang="ts">
/**
 * AI 助手 - 左侧文件面板
 *
 * 展示当前查看目录的外部文件树，支持新建 / 删除 / 重命名 / 移动（复用 ExternalFileTree 的右键菜单）。
 */
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ExternalFileTree from '../layout/ExternalFileTree.vue'

interface DirNode {
  name: string
  path: string
  children?: DirNode[]
  files?: Array<{ id: number; filename: string; path: string; size: number; isImage: boolean }>
  hasChildren?: boolean
  loaded?: boolean
}

const emit = defineEmits<{
  (e: 'select', path: string): void
}>()

const tree = ref<DirNode[]>([])
const rootPath = ref('')
const loading = ref(false)
const treeRef = ref<any>(null)

/** 读取当前查看路径并扫描目录树 */
async function loadRoot() {
  loading.value = true
  try {
    const res: any = await window.api.getCurrentViewingPath()
    rootPath.value = res?.path || ''
    if (!rootPath.value) {
      tree.value = []
      return
    }
    const scan: any = await window.api.scanExternalDirs(rootPath.value)
    tree.value = scan?.success ? scan.tree : []
  } catch (e) {
    console.error('[AiFilePanel] 加载目录失败:', e)
  } finally {
    loading.value = false
  }
}

/** 选择文件夹作为根目录 */
async function openFolder() {
  try {
    const result: any = await window.api.openFileDialog({
      properties: ['openDirectory'],
      title: '选择文件夹'
    })
    if (!result.canceled && result.filePaths?.length) {
      await window.api.setCurrentViewingPath(result.filePaths[0])
      await loadRoot()
    }
  } catch (e) {
    ElMessage.error('打开文件夹失败')
  }
}

/** 在根目录新建文件 */
async function newFileAtRoot() {
  if (!rootPath.value) {
    ElMessage.warning('请先打开一个文件夹')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('文件名称（含扩展名）', '新建文件', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^[^\\/:*?"<>|]+$/,
      inputErrorMessage: '名称不能包含特殊字符'
    })
    if (value?.trim()) {
      await window.api.createExternalFile(rootPath.value + '/' + value.trim())
      ElMessage.success('文件已创建')
      await loadRoot()
    }
  } catch { /* cancel */ }
}

/** 在根目录新建文件夹 */
async function newFolderAtRoot() {
  if (!rootPath.value) {
    ElMessage.warning('请先打开一个文件夹')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('文件夹名称', '新建文件夹', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^[^\\/:*?"<>|]+$/,
      inputErrorMessage: '名称不能包含特殊字符'
    })
    if (value?.trim()) {
      await window.api.createExternalDir(rootPath.value + '/' + value.trim())
      ElMessage.success('文件夹已创建')
      await loadRoot()
    }
  } catch { /* cancel */ }
}

/** 点击文件 → 通知父组件在中栏打开 */
function handlePreview(file: { original_path: string }) {
  emit('select', file.original_path)
}

onMounted(loadRoot)

defineExpose({ loadRoot })
</script>

<template>
  <div class="ai-file-panel">
    <div class="panel-header">
      <el-icon class="header-icon"><Files /></el-icon>
      <span class="panel-title" :title="rootPath || '未选择文件夹'">
        {{ rootPath ? rootPath.split(/[\\/]/).pop() : '未选择文件夹' }}
      </span>
      <div class="header-actions">
        <el-button size="small" text title="打开文件夹" @click="openFolder">
          <el-icon><FolderOpened /></el-icon>
        </el-button>
        <el-button size="small" text title="新建文件" :disabled="!rootPath" @click="newFileAtRoot">
          <el-icon><DocumentAdd /></el-icon>
        </el-button>
        <el-button size="small" text title="新建文件夹" :disabled="!rootPath" @click="newFolderAtRoot">
          <el-icon><FolderAdd /></el-icon>
        </el-button>
        <el-button size="small" text title="刷新" :disabled="!rootPath" @click="loadRoot">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="panel-body">
      <el-scrollbar v-if="rootPath" class="tree-scroll">
        <ExternalFileTree
          ref="treeRef"
          :tree="tree"
          @preview="handlePreview"
          @refresh="loadRoot"
        />
      </el-scrollbar>
      <el-empty v-else description="请先打开一个文件夹" :image-size="80" />
    </div>
  </div>
</template>

<style scoped>
.ai-file-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  background: var(--sidebar-bg, transparent);
}
.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.header-icon { font-size: 15px; color: var(--accent-color); }
.panel-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.panel-body { flex: 1; overflow: hidden; }
.tree-scroll { height: 100%; padding: 4px; }
</style>
