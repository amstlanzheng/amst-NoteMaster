<script setup lang="ts">
import type { Category, Note } from '@shared/types'
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUiStore } from '../../stores/ui'
import { useNoteStore } from '../../stores/note'
import { useNoteTreeStore } from '../../stores/noteTree'
import { useNoteContextMenu } from '../../composables/useNoteContextMenu'
import NoteContextMenu from '../common/NoteContextMenu.vue'

const uiStore = useUiStore()
const noteStore = useNoteStore()
const noteTreeStore = useNoteTreeStore()

const props = defineProps<{
  category: Category
  depth: number
  selectedCategoryId: number | null
  dragOverCatId: number | null
}>()

const emit = defineEmits<{
  (e: 'select-category', id: number): void
  (e: 'context-menu', event: MouseEvent, cat: Category): void
  (e: 'open-note', note: Note): void
  (e: 'tree-data-changed'): void
  (e: 'cat-drag-start', event: DragEvent, cat: Category): void
  (e: 'cat-drag-over', event: DragEvent, catId: number): void
  (e: 'cat-drag-leave'): void
  (e: 'cat-drop', event: DragEvent, catId: number): void
}>()

// 该分类直接包含的文件（笔记）
const notes = computed<Note[]>(() => noteTreeStore.getNotesByCategory(props.category.id))

// 笔记右键菜单（操作后刷新树数据）
const noteMenu = useNoteContextMenu({
  onChanged: () => emit('tree-data-changed')
})

// 展开状态 - 从 localStorage 恢复，默认展开
const STORAGE_KEY = 'amnote-category-expanded'
function getSavedExpandedIds(): Set<number> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return new Set(JSON.parse(saved))
  } catch {}
  return new Set()
}

const isExpanded = ref(!getSavedExpandedIds().has(props.category.id))

// 是否有子文件夹
const hasSubCategories = computed(
  () => !!(props.category.children && props.category.children.length > 0)
)
// 是否有直接文件（受设置开关控制）
const hasNotes = computed(() => uiStore.showFilesInCategory && notes.value.length > 0)
// 是否可展开（子文件夹 或 文件）
const hasChildren = computed(() => hasSubCategories.value || hasNotes.value)

// 保存展开状态到 localStorage
function saveExpandedState() {
  const ids = getSavedExpandedIds()
  if (isExpanded.value) {
    ids.delete(props.category.id)
  } else {
    ids.add(props.category.id)
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {}
}

// 切换展开状态
function toggleExpand(event: Event) {
  event.stopPropagation()
  if (hasChildren.value) {
    isExpanded.value = !isExpanded.value
    saveExpandedState()
  }
}

function selectCategory(catId: number) {
  emit('select-category', catId)
}

function openNote(note: Note) {
  emit('open-note', note)
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
      emit('tree-data-changed')

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
        emit('tree-data-changed')
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
    :data-category-id="category.id"
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
    
    <!-- 文件夹图标：展开时为打开的文件夹 -->
    <el-icon class="folder-icon" :class="{ 'is-favorite': category.is_favorite }">
      <component :is="isExpanded && hasChildren ? 'FolderOpened' : 'Folder'" />
    </el-icon>

    <span class="category-name">{{ category.name }}</span>

    <!-- 收藏标识 -->
    <el-icon v-if="category.is_favorite" class="cat-fav-icon" title="已收藏"><StarFilled /></el-icon>

    <!-- 笔记数量徽章 -->
    <span v-if="uiStore.showFolderCount && category.note_count && category.note_count > 0" class="note-count-badge">
      {{ category.note_count }}
    </span>
  </div>
  
  <!-- 子分类列表 -->
  <template v-if="hasSubCategories && isExpanded">
    <CategoryTreeItem
      v-for="child in category.children"
      :key="child.id"
      :category="child"
      :depth="depth + 1"
      :selected-category-id="selectedCategoryId"
      :drag-over-cat-id="dragOverCatId"
      @select-category="(id: number) => emit('select-category', id)"
      @context-menu="(evt: MouseEvent, cat: Category) => emit('context-menu', evt, cat)"
      @open-note="(note: Note) => emit('open-note', note)"
      @tree-data-changed="emit('tree-data-changed')"
      @cat-drag-start="(evt: DragEvent, cat: Category) => emit('cat-drag-start', evt, cat)"
      @cat-drag-over="(evt: DragEvent, catId: number) => emit('cat-drag-over', evt, catId)"
      @cat-drag-leave="emit('cat-drag-leave')"
      @cat-drop="(evt: DragEvent, catId: number) => emit('cat-drop', evt, catId)"
    />
  </template>

  <!-- 当前分类直接包含的文件（笔记） -->
  <template v-if="hasNotes && isExpanded">
    <div
      v-for="note in notes"
      :key="note.id"
      class="file-row"
      :class="{ active: noteStore.currentNote?.id === note.id }"
      :style="{ paddingLeft: (50 + depth * 20) + 'px' }"
      @click.stop="openNote(note)"
      @contextmenu="noteMenu.open($event, note)"
    >
      <el-icon class="file-icon"><Document /></el-icon>
      <span class="file-name">{{ note.title || '无标题' }}</span>
      <el-icon v-if="note.is_pinned" class="file-flag-icon pin" title="已置顶"><Top /></el-icon>
      <el-icon v-else-if="note.is_favorite" class="file-flag-icon fav" title="已收藏"><StarFilled /></el-icon>
    </div>
  </template>

  <!-- 文件（笔记）右键菜单 -->
  <NoteContextMenu :ctx="noteMenu" />
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

/* 分类内文件（笔记）行 */
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s ease;
  font-size: 13px;
  user-select: none;
}
.file-row:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.file-row.active {
  background: var(--active-bg);
  color: var(--accent-color);
}
.file-icon {
  font-size: 14px;
  flex-shrink: 0;
}
.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 收藏文件夹图标染成暖色 */
.folder-icon.is-favorite {
  color: var(--el-color-warning, #e6a23c);
}
.cat-fav-icon {
  font-size: 11px;
  color: var(--el-color-warning, #e6a23c);
  flex-shrink: 0;
}
/* 文件行的置顶 / 收藏标识 */
.file-flag-icon {
  font-size: 12px;
  flex-shrink: 0;
}
.file-flag-icon.pin { color: var(--accent-color); }
.file-flag-icon.fav { color: var(--el-color-warning, #e6a23c); }
</style>
