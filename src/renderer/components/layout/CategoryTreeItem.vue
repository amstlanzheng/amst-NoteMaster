<script setup lang="ts">
import type { Category } from '@shared/types'
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUiStore } from '../../stores/ui'

const uiStore = useUiStore()

const props = defineProps<{
  category: Category
  depth: number
  selectedCategoryId: number | null
  dragOverCatId: number | null
}>()

const emit = defineEmits<{
  (e: 'select-category', id: number): void
  (e: 'context-menu', event: MouseEvent, cat: Category): void
  (e: 'cat-drag-start', event: DragEvent, cat: Category): void
  (e: 'cat-drag-over', event: DragEvent, catId: number): void
  (e: 'cat-drag-leave'): void
  (e: 'cat-drop', event: DragEvent, catId: number): void
}>()

// 展开状态（默认展开）
const isExpanded = ref(true)

// 是否有子节点
const hasChildren = computed(() => props.category.children && props.category.children.length > 0)

// 切换展开状态
function toggleExpand(event: Event) {
  event.stopPropagation()
  if (hasChildren.value) {
    isExpanded.value = !isExpanded.value
  }
}

function selectCategory(catId: number) {
  emit('select-category', catId)
}

function handleContextMenu(event: MouseEvent, cat: Category) {
  emit('context-menu', event, cat)
}

function onDragStart(event: DragEvent, cat: Category) {
  emit('cat-drag-start', event, cat)
}

function onDragOver(event: DragEvent, catId: number) {
  emit('cat-drag-over', event, catId)
}

function onDragLeave() {
  emit('cat-drag-leave')
}

function onDrop(event: DragEvent, catId: number) {
  event.preventDefault()
  emit('cat-drop', event, catId)
  
  // 先尝试从 dataTransfer 获取文件路径（应用内部拖拽）
  const filePath = event.dataTransfer?.getData('text/plain')
  if (filePath) {
    handleExternalFileDrop(filePath, catId)
    return
  }
  
  // 处理外部文件拖拽（从文件系统拖拽）
  const items = event.dataTransfer?.items
  if (!items) return
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === 'file') {
      const file = item.getAsFile()
      // 使用类型断言访问 Electron 特有的 path 属性
      const filePath = (file as any)?.path
      if (filePath) {
        handleExternalFileDrop(filePath, catId)
      }
    }
  }
}

// 处理外部文件拖拽
async function handleExternalFileDrop(filePath: string, categoryId: number) {
  try {
    ElMessage.info(`正在导入文件到分类...`)
    
    const importResult = await window.api.importFile(filePath, categoryId)
    
    if (importResult.success) {
      ElMessage.success(`文件已导入到分类`)
      
      // 如果是图片，显示提示
      if (importResult.isImage) {
        ElMessage.info('图片已导入，请在笔记中使用 Markdown 语法插入')
      }
    } else if (importResult.conflict) {
      // 处理文件冲突
      const result = await ElMessageBox.confirm(
        `文件 "${importResult.filename}" 已存在，请选择操作：`,
        '文件冲突',
        {
          distinguishCancelAndClose: true,
          confirmButtonText: '覆盖',
          cancelButtonText: '跳过',
          showCancelButton: true,
          type: 'warning'
        }
      )
      
      // 用户选择覆盖或重命名
      const action = result === 'confirm' ? 'overwrite' : 'skip'
      const resolveResult = await window.api.resolveFileConflict({
        action,
        originalPath: importResult.originalPath,
        filename: importResult.filename,
        categoryId
      })
      
      if (resolveResult.success) {
        ElMessage.success('文件导入成功')
      }
    } else {
      ElMessage.error(`导入失败: ${importResult.error}`)
    }
  } catch (error) {
    console.error('导入文件失败:', error)
    ElMessage.error('导入文件失败')
  }
}
</script>

<template>
  <div
    class="menu-item"
    :class="{
      active: selectedCategoryId === category.id,
      'drag-over': dragOverCatId === category.id
    }"
    :style="{ paddingLeft: (12 + depth * 20) + 'px' }"
    draggable="true"
    @click="selectCategory(category.id)"
    @contextmenu="handleContextMenu($event, category)"
    @dragstart="onDragStart($event, category)"
    @dragover="onDragOver($event, category.id)"
    @dragleave="onDragLeave"
    @drop="onDrop($event, category.id)"
  >
    <!-- 展开/收起箭头 -->
    <el-icon 
      v-if="hasChildren" 
      class="expand-arrow" 
      :class="{ expanded: isExpanded }"
      @click="toggleExpand"
    >
      <ArrowRight />
    </el-icon>
    <!-- 占位符，保持无子节点的项目对齐 -->
    <span v-else class="arrow-placeholder"></span>
    
    <!-- 文件夹图标 -->
    <el-icon v-if="depth === 0"><Folder /></el-icon>
    <el-icon v-else><FolderOpened /></el-icon>
    
    <span class="category-name">{{ category.name }}</span>
    
    <!-- 笔记数量徽章 -->
    <span v-if="uiStore.showFolderCount && category.note_count && category.note_count > 0" class="note-count-badge">
      {{ category.note_count }}
    </span>
  </div>
  
  <!-- 子分类列表 -->
  <template v-if="hasChildren && isExpanded">
    <CategoryTreeItem
      v-for="child in category.children"
      :key="child.id"
      :category="child"
      :depth="depth + 1"
      :selected-category-id="selectedCategoryId"
      :drag-over-cat-id="dragOverCatId"
      @select-category="(id: number) => emit('select-category', id)"
      @context-menu="(evt: MouseEvent, cat: Category) => emit('context-menu', evt, cat)"
      @cat-drag-start="(evt: DragEvent, cat: Category) => emit('cat-drag-start', evt, cat)"
      @cat-drag-over="(evt: DragEvent, catId: number) => emit('cat-drag-over', evt, catId)"
      @cat-drag-leave="emit('cat-drag-leave')"
      @cat-drop="(evt: DragEvent, catId: number) => emit('cat-drop', evt, catId)"
    />
  </template>
</template>

<style scoped>
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s ease;
  font-size: 13px;
}
.menu-item:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.menu-item.active {
  background: var(--active-bg);
  color: var(--accent-color);
  font-weight: 500;
}
.menu-item.drag-over {
  background: rgba(0, 120, 212, 0.1);
  outline: 2px dashed var(--accent-color);
  outline-offset: -2px;
}
.menu-item[draggable="true"] {
  cursor: grab;
}
.menu-item[draggable="true"]:active {
  cursor: grabbing;
}
.expand-arrow {
  font-size: 12px;
  color: var(--text-tertiary);
  transition: transform 0.2s ease;
  cursor: pointer;
  flex-shrink: 0;
}
.expand-arrow.expanded {
  transform: rotate(90deg);
}
.expand-arrow:hover {
  color: var(--text-primary);
}
.arrow-placeholder {
  width: 12px; /* 与箭头图标宽度一致 */
  flex-shrink: 0;
}
.category-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.note-count-badge {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--hover-bg);
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  flex-shrink: 0;
}
</style>
