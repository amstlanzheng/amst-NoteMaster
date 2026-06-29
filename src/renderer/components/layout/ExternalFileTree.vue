<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

interface ExternalFile {
  id: number
  filename: string
  path: string
  size: number
  isImage?: boolean
}

interface DirNode {
  name: string
  path: string
  children?: DirNode[]
  files?: ExternalFile[]
  hasChildren?: boolean // 标记是否有子目录
  loaded?: boolean // 标记是否已加载子目录
}

const props = defineProps<{
  tree: DirNode[]
}>()

const emit = defineEmits<{
  (e: 'preview', file: { id: number; original_path: string; filename: string; size: number; imported_at: string }): void
  (e: 'open', filePath: string): void
  (e: 'dragstart', event: DragEvent, file: { id: number; original_path: string; filename: string; size: number; imported_at: string }): void
}>()

// 展开的文件夹
const expandedDirs = ref<Set<string>>(new Set())

// 切换文件夹展开状态（支持懒加载）
async function toggleDir(dirPath: string, node: DirNode) {
  console.log('[toggleDir] Clicked on:', dirPath, 'expanded:', expandedDirs.value.has(dirPath))
  if (expandedDirs.value.has(dirPath)) {
    expandedDirs.value.delete(dirPath)
    console.log('[toggleDir] Collapsed')
  } else {
    expandedDirs.value.add(dirPath)
    console.log('[toggleDir] Expanded, hasChildren:', node.hasChildren, 'loaded:', node.loaded)
    
    // 如果未加载且有子目录，则懒加载
    if (!node.loaded && node.hasChildren) {
      console.log('[toggleDir] Will load children')
      await loadChildren(node)
    }
  }
}

// 懒加载子目录
async function loadChildren(node: DirNode) {
  try {
    console.log('[loadChildren] Loading children for:', node.path)
    const result = await window.api.scanExternalDirs(node.path)
    console.log('[loadChildren] Result:', result)
    if (result.success && result.tree) {
      console.log('[loadChildren] Tree nodes:', result.tree.length)
      if (result.tree.length > 0) {
        console.log('[loadChildren] First node:', JSON.stringify(result.tree[0], null, 2))
      }
      node.children = result.tree
      node.loaded = true
    } else {
      ElMessage.error(`加载失败: ${result.error}`)
    }
  } catch (error) {
    console.error('加载子目录失败:', error)
    ElMessage.error('加载子目录失败')
  }
}

// 全部展开
function expandAll() {
  function collectPaths(nodes: DirNode[]) {
    for (const node of nodes) {
      expandedDirs.value.add(node.path)
      if (node.children && node.children.length > 0) {
        collectPaths(node.children)
      }
    }
  }
  collectPaths(props.tree)
}

// 全部收起
function collapseAll() {
  expandedDirs.value.clear()
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

// 判断是否是纯文件节点（只有一个文件，没有子目录）
function isFileNode(node: DirNode): boolean {
  // 如果只有 files 数组且长度为 1，且没有 children，则是纯文件节点
  return !!(node.files && node.files.length === 1 && (!node.children || node.children.length === 0))
}

// 转换文件格式（添加缺少的字段）
function convertFile(file: ExternalFile): { id: number; original_path: string; filename: string; size: number; imported_at: string } {
  const converted = {
    id: file.id,
    original_path: file.path,
    filename: file.filename,
    size: file.size,
    imported_at: new Date().toISOString()
  }
  console.log('[ExternalFileTree] Converting file:', file, '->', converted)
  return converted
}

defineExpose({
  expandAll,
  collapseAll
})
</script>

<template>
  <div class="external-file-tree">
    <div v-for="node in tree" :key="node.path" class="tree-node">
      <!-- 判断是否是纯文件节点 -->
      <template v-if="isFileNode(node)">
        <!-- 文件节点：直接显示文件 -->
        <div 
          class="file-item"
          draggable="true"
          @dragstart="(event) => emit('dragstart', event, convertFile(node.files![0]))"
        >
          <div class="file-info" @click="emit('preview', convertFile(node.files![0]))" title="点击预览文件">
            <el-icon class="file-icon">
              <Picture v-if="node.files![0].isImage" />
              <Document v-else />
            </el-icon>
            <div class="file-details">
              <div class="file-name" :title="node.files![0].filename">{{ node.files![0].filename }}</div>
              <div class="file-meta">
                <span>{{ formatFileSize(node.files![0].size) }}</span>
              </div>
            </div>
          </div>
          <el-button 
            size="small" 
            text 
            type="primary"
            @click.stop="emit('open', node.files![0].path)"
            title="用系统程序打开"
          >
            <el-icon><FolderOpened /></el-icon>
          </el-button>
        </div>
      </template>
      
      <!-- 文件夹节点 -->
      <template v-else>
        <div class="dir-item">
          <div 
            class="dir-header" 
            @click="toggleDir(node.path, node)"
          >
            <el-icon class="expand-icon">
              <ArrowDown v-if="expandedDirs.has(node.path)" />
              <ArrowRight v-else />
            </el-icon>
            <el-icon class="folder-icon"><FolderOpened /></el-icon>
            <span class="dir-name" :title="node.name">{{ node.name }}</span>
            <el-tag v-if="node.files && node.files.length > 0" size="small" round>{{ node.files.length }}</el-tag>
          </div>
          
          <!-- 子文件夹和文件 -->
          <div v-if="expandedDirs.has(node.path)" class="dir-content">
            <!-- 递归显示子文件夹 -->
            <ExternalFileTree
              v-if="node.children && node.children.length > 0"
              :tree="node.children"
              @preview="(file) => emit('preview', file)"
              @open="(path) => emit('open', path)"
              @dragstart="(event, file) => emit('dragstart', event, file)"
            />
            
            <!-- 文件列表 -->
            <div v-if="node.files && node.files.length > 0" class="file-list">
              <div 
                v-for="file in node.files" 
                :key="file.id" 
                class="file-item"
                draggable="true"
                @dragstart="(event) => emit('dragstart', event, convertFile(file))"
              >
                <div class="file-info" @click="emit('preview', convertFile(file))" title="点击预览文件">
                  <el-icon class="file-icon">
                    <Picture v-if="file.isImage" />
                    <Document v-else />
                  </el-icon>
                  <div class="file-details">
                    <div class="file-name" :title="file.filename">{{ file.filename }}</div>
                    <div class="file-meta">
                      <span>{{ formatFileSize(file.size) }}</span>
                    </div>
                  </div>
                </div>
                <el-button 
                  size="small" 
                  text 
                  type="primary"
                  @click.stop="emit('open', file.path)"
                  title="用系统程序打开"
                >
                  <el-icon><FolderOpened /></el-icon>
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.external-file-tree {
  padding: 0;
}

.tree-node {
  margin-left: 0;
}

.dir-item {
  margin-bottom: 4px;
}

.dir-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}

.dir-header:hover {
  background: var(--hover-bg);
}

.dir-header .expand-icon {
  font-size: 12px;
  color: var(--text-tertiary);
  width: 16px;
  flex-shrink: 0;
}

.dir-header .folder-icon {
  font-size: 16px;
  color: #f5a623;
  flex-shrink: 0;
}

.dir-header .dir-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-content {
  margin-left: 20px;
  padding-left: 8px;
  border-left: 1px solid var(--border-color);
}

.file-list {
  margin-top: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background 0.15s;
  margin-bottom: 2px;
}

.file-item[draggable="true"] {
  cursor: grab;
}

.file-item[draggable="true"]:active {
  cursor: grabbing;
}

.file-item:hover {
  background: var(--hover-bg);
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.file-icon {
  font-size: 16px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}
</style>
