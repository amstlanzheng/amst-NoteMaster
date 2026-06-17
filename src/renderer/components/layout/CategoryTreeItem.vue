<script setup lang="ts">
import type { Category } from '@shared/types'

defineProps<{
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
  emit('cat-drop', event, catId)
}
</script>

<template>
  <div
    class="menu-item"
    :class="{
      active: selectedCategoryId === category.id,
      'drag-over': dragOverCatId === category.id
    }"
    :style="{ paddingLeft: (12 + depth * 16) + 'px' }"
    draggable="true"
    @click="selectCategory(category.id)"
    @contextmenu="handleContextMenu($event, category)"
    @dragstart="onDragStart($event, category)"
    @dragover="onDragOver($event, category.id)"
    @dragleave="onDragLeave"
    @drop="onDrop($event, category.id)"
  >
    <el-icon v-if="depth === 0"><Folder /></el-icon>
    <el-icon v-else><FolderOpened /></el-icon>
    <span>{{ category.name }}</span>
  </div>
  <template v-if="category.children && category.children.length > 0">
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
</style>
