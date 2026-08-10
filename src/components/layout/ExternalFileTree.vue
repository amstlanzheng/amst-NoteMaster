<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

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
  (e: 'refresh'): void
}>()

// 展开的文件夹 - 从 localStorage 恢复
const EXPANDED_STORAGE_KEY = 'amnote-external-expanded'
function loadExpandedDirs(): Set<string> {
  try {
    const saved = localStorage.getItem(EXPANDED_STORAGE_KEY)
    if (saved) return new Set(JSON.parse(saved))
  } catch {}
  return new Set()
}

function saveExpandedDirs() {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...expandedDirs.value]))
  } catch {}
}

const expandedDirs = ref<Set<string>>(loadExpandedDirs())

// 当前选中的节点（文件或文件夹）
const selectedNode = ref<{ type: 'file' | 'dir'; path: string; node?: DirNode } | null>(null)

// 右键菜单
const contextMenu = ref<{ visible: boolean; x: number; y: number; type: 'dir' | 'file'; path: string; node?: DirNode }>({
  visible: false, x: 0, y: 0, type: 'dir', path: ''
})

// 切换文件夹展开状态（支持懒加载）
async function toggleDir(dirPath: string, node: DirNode) {
  if (expandedDirs.value.has(dirPath)) {
    expandedDirs.value.delete(dirPath)
  } else {
    expandedDirs.value.add(dirPath)
    // 如果未加载且有子目录，则懒加载
    if (!node.loaded && node.hasChildren) {
      await loadChildren(node)
    }
  }
  saveExpandedDirs()
}

// 懒加载子目录
async function loadChildren(node: DirNode) {
  try {
    const result = await window.api.scanExternalDirs(node.path)
    if (result.success && result.tree) {
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

// 全部展开（递归加载所有子目录）
async function expandAll() {
  async function expandNodes(nodes: DirNode[]) {
    for (const node of nodes) {
      expandedDirs.value.add(node.path)
      // 如果未加载且有子目录，先加载
      if (!node.loaded && node.hasChildren) {
        await loadChildren(node)
      }
      // 递归展开子节点
      if (node.children && node.children.length > 0) {
        await expandNodes(node.children)
      }
    }
  }
  await expandNodes(props.tree)
  saveExpandedDirs()
}

// 全部收起
function collapseAll() {
  expandedDirs.value.clear()
  saveExpandedDirs()
}

// 选中节点
function selectNode(type: 'file' | 'dir', path: string, node?: DirNode) {
  selectedNode.value = { type, path, node }
}

// 右键菜单
function handleContextMenu(event: MouseEvent, type: 'dir' | 'file', path: string, node?: DirNode) {
  event.preventDefault()
  event.stopPropagation()
  selectedNode.value = { type, path, node }
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, type, path, node }
  setTimeout(() => { document.addEventListener('click', closeContextMenu, { once: true }) }, 0)
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

// 获取当前选中节点的父目录路径
function getParentPath(): string | null {
  if (!selectedNode.value) return null
  const path = selectedNode.value.path
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (lastSep <= 0) return null
  return path.substring(0, lastSep)
}

// 新建文件夹
async function createNewFolder(inDir?: boolean) {
  closeContextMenu()
  try {
    const { value } = await ElMessageBox.prompt('文件夹名称', '新建文件夹', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^[^\\/:*?"<>|]+$/,
      inputErrorMessage: '名称不能包含特殊字符'
    })
    if (value?.trim()) {
      let parentPath: string
      if (inDir && selectedNode.value?.type === 'dir') {
        // 在选中文件夹内部创建
        parentPath = selectedNode.value.path
      } else {
        // 在选中项同级目录创建
        const pp = getParentPath()
        if (!pp) {
          ElMessage.error('无法确定创建位置')
          return
        }
        parentPath = pp
      }
      const dirPath = parentPath + '/' + value.trim()
      const result = await window.api.createExternalDir(dirPath)
      if (result.success) {
        ElMessage.success('文件夹已创建')
        emit('refresh')
      } else {
        ElMessage.error(`创建失败: ${result.error}`)
      }
    }
  } catch { /* cancel */ }
}

// 新建文件
async function createNewFile(inDir?: boolean) {
  closeContextMenu()
  try {
    const { value } = await ElMessageBox.prompt('文件名称（含扩展名）', '新建文件', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^[^\\/:*?"<>|]+$/,
      inputErrorMessage: '名称不能包含特殊字符'
    })
    if (value?.trim()) {
      let parentPath: string
      if (inDir && selectedNode.value?.type === 'dir') {
        parentPath = selectedNode.value.path
      } else {
        const pp = getParentPath()
        if (!pp) {
          ElMessage.error('无法确定创建位置')
          return
        }
        parentPath = pp
      }
      const filePath = parentPath + '/' + value.trim()
      const result = await window.api.createExternalFile(filePath)
      if (result.success) {
        ElMessage.success('文件已创建')
        emit('refresh')
      } else {
        ElMessage.error(`创建失败: ${result.error}`)
      }
    }
  } catch { /* cancel */ }
}

// 删除文件夹
async function deleteDir() {
  closeContextMenu()
  if (!selectedNode.value) return
  try {
    await ElMessageBox.confirm(
      `确定删除文件夹「${selectedNode.value.path.split('/').pop() || selectedNode.value.path.split('\\').pop()}」及其所有内容？此操作不可恢复。`,
      '删除文件夹',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    const result = await window.api.deleteExternalDir(selectedNode.value.path)
    if (result.success) {
      ElMessage.success('文件夹已删除')
      expandedDirs.value.delete(selectedNode.value.path)
      saveExpandedDirs()
      selectedNode.value = null
      emit('refresh')
    } else {
      ElMessage.error(`删除失败: ${result.error}`)
    }
  } catch { /* cancel */ }
}

// 删除文件
async function deleteFile() {
  closeContextMenu()
  if (!selectedNode.value) return
  try {
    const fileName = selectedNode.value.path.split('/').pop() || selectedNode.value.path.split('\\').pop() || ''
    await ElMessageBox.confirm(
      `确定删除文件「${fileName}」？此操作不可恢复。`,
      '删除文件',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    const result = await window.api.deleteExternalFile(selectedNode.value.path)
    if (result.success) {
      ElMessage.success('文件已删除')
      selectedNode.value = null
      emit('refresh')
    } else {
      ElMessage.error(`删除失败: ${result.error}`)
    }
  } catch { /* cancel */ }
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
  return !!(node.files && node.files.length === 1 && (!node.children || node.children.length === 0))
}

// 转换文件格式（添加缺少的字段）
function convertFile(file: ExternalFile): { id: number; original_path: string; filename: string; size: number; imported_at: string } {
  return {
    id: file.id,
    original_path: file.path,
    filename: file.filename,
    size: file.size,
    imported_at: new Date().toISOString()
  }
}

// 工具栏：新建文件夹（根据选中项位置）
async function toolbarNewFolder() {
  if (selectedNode.value) {
    if (selectedNode.value.type === 'dir') {
      await createNewFolder(true)
    } else {
      await createNewFolder(false)
    }
  } else {
    ElMessage.info('请先选中一个文件或文件夹')
  }
}

// 工具栏：新建文件（根据选中项位置）
async function toolbarNewFile() {
  if (selectedNode.value) {
    if (selectedNode.value.type === 'dir') {
      await createNewFile(true)
    } else {
      await createNewFile(false)
    }
  } else {
    ElMessage.info('请先选中一个文件或文件夹')
  }
}

defineExpose({
  expandAll,
  collapseAll,
  toolbarNewFolder,
  toolbarNewFile
})
</script>

<template>
  <div class="external-file-tree" @click="selectedNode = null">
    <div v-for="node in tree" :key="node.path" class="tree-node">
      <!-- 判断是否是纯文件节点 -->
      <template v-if="isFileNode(node)">
        <!-- 文件节点：直接显示文件 -->
        <div 
          class="file-item"
          :class="{ selected: selectedNode?.path === node.files![0].path }"
          draggable="true"
          @click.stop="selectNode('file', node.files![0].path)"
          @dragstart="(event) => emit('dragstart', event, convertFile(node.files![0]))"
          @contextmenu="handleContextMenu($event, 'file', node.files![0].path)"
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
            :class="{ selected: selectedNode?.path === node.path }"
            @click.stop="selectNode('dir', node.path, node); toggleDir(node.path, node)"
            @contextmenu="handleContextMenu($event, 'dir', node.path, node)"
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
              @refresh="emit('refresh')"
            />
            
            <!-- 文件列表 -->
            <div v-if="node.files && node.files.length > 0" class="file-list">
              <div 
                v-for="file in node.files" 
                :key="file.id" 
                class="file-item"
                :class="{ selected: selectedNode?.path === file.path }"
                draggable="true"
                @click.stop="selectNode('file', file.path)"
                @dragstart="(event) => emit('dragstart', event, convertFile(file))"
                @contextmenu="handleContextMenu($event, 'file', file.path)"
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

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="contextMenu.visible" class="ext-context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop>
        <template v-if="contextMenu.type === 'dir'">
          <div class="ext-context-menu-item" @click="createNewFolder(true)">
            <el-icon><FolderAdd /></el-icon> 在此文件夹内新建文件夹
          </div>
          <div class="ext-context-menu-item" @click="createNewFile(true)">
            <el-icon><Document /></el-icon> 在此文件夹内新建文件
          </div>
          <div class="ext-context-menu-divider"></div>
          <div class="ext-context-menu-item danger" @click="deleteDir">
            <el-icon><Delete /></el-icon> 删除文件夹
          </div>
        </template>
        <template v-else>
          <div class="ext-context-menu-item" @click="createNewFolder(false)">
            <el-icon><FolderAdd /></el-icon> 同级新建文件夹
          </div>
          <div class="ext-context-menu-item" @click="createNewFile(false)">
            <el-icon><Document /></el-icon> 同级新建文件
          </div>
          <div class="ext-context-menu-divider"></div>
          <div class="ext-context-menu-item danger" @click="deleteFile">
            <el-icon><Delete /></el-icon> 删除文件
          </div>
        </template>
      </div>
    </Teleport>
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

.dir-header.selected {
  background: rgba(0, 120, 212, 0.1);
  outline: 1px solid var(--accent-color);
  outline-offset: -1px;
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

.file-item.selected {
  background: rgba(0, 120, 212, 0.1);
  outline: 1px solid var(--accent-color);
  outline-offset: -1px;
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

/* 右键菜单 */
.ext-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--el-bg-color-overlay, #fff);
  border: 1px solid var(--el-border-color-light, #e4e7ed);
  border-radius: 6px;
  padding: 4px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  min-width: 180px;
}

.ext-context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s;
}

.ext-context-menu-item:hover {
  background: var(--hover-bg);
}

.ext-context-menu-item.danger {
  color: #f56c6c;
}

.ext-context-menu-item.danger:hover {
  background: #fef0f0;
}

.ext-context-menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}
</style>
