<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatRelative } from '../utils/format'
import type { Note } from '@shared/types'

const trashNotes = ref<Note[]>([])
const selectedIds = ref<Set<number>>(new Set())
const batchDeleting = ref(false)

const allSelected = computed(() => trashNotes.value.length > 0 && selectedIds.value.size === trashNotes.value.length)

async function loadTrash() {
  trashNotes.value = await window.api.getTrashNotes()
  selectedIds.value.clear()
}

function toggleSelect(id: number) {
  const newSet = new Set(selectedIds.value)
  if (newSet.has(id)) newSet.delete(id)
  else newSet.add(id)
  selectedIds.value = newSet
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(trashNotes.value.map(n => n.id))
  }
}

async function handleRestore(id: number) {
  await window.api.restoreNote(id)
  loadTrash()
}

async function handlePermanentDelete(id: number) {
  await window.api.deleteNote(id, true)
  loadTrash()
}

async function handleEmptyTrash() {
  if (trashNotes.value.length === 0) {
    ElMessage.info('回收站为空')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定清空回收站吗？将永久删除 ${trashNotes.value.length} 篇笔记，此操作不可恢复。`,
      '清空回收站',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' }
    )
    const result = await window.api.emptyTrash()
    ElMessage.success(`已永久删除 ${result.deleted} 篇笔记`)
    loadTrash()
  } catch {
    // 用户取消
  }
}

async function handleBatchDelete() {
  if (selectedIds.value.size === 0) {
    ElMessage.warning('请先选择笔记')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定永久删除选中的 ${selectedIds.value.size} 篇笔记吗？此操作不可恢复。`,
      '批量删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    batchDeleting.value = true
    const ids = Array.from(selectedIds.value)
    await window.api.batchDeleteNotes(ids, true)
    ElMessage.success(`已永久删除 ${ids.length} 篇笔记`)
    selectedIds.value.clear()
    batchDeleting.value = false
    loadTrash()
  } catch {
    batchDeleting.value = false
  }
}

async function handleBatchRestore() {
  if (selectedIds.value.size === 0) {
    ElMessage.warning('请先选择笔记')
    return
  }
  const ids = Array.from(selectedIds.value)
  for (const id of ids) {
    await window.api.restoreNote(id)
  }
  ElMessage.success(`已恢复 ${ids.length} 篇笔记`)
  loadTrash()
}

onMounted(loadTrash)
</script>

<template>
  <div class="trash-view">
    <div class="view-header">
      <h2>回收站</h2>
      <div class="header-actions">
        <template v-if="selectedIds.size > 0">
          <el-button size="small" @click="handleBatchRestore">恢复 ({{ selectedIds.size }})</el-button>
          <el-button size="small" type="danger" @click="handleBatchDelete">永久删除 ({{ selectedIds.size }})</el-button>
        </template>
        <el-button
          v-if="trashNotes.length > 0"
          size="small"
          type="danger"
          plain
          @click="handleEmptyTrash"
        >
          清空回收站
        </el-button>
      </div>
    </div>
    <div v-if="trashNotes.length === 0" class="empty-state">
      <el-icon :size="50"><Delete /></el-icon>
      <p>回收站为空</p>
    </div>
    <div v-else class="trash-list">
      <div class="trash-item select-all-row" @click="toggleSelectAll">
        <el-checkbox :model-value="allSelected" :indeterminate="selectedIds.size > 0 && !allSelected" />
        <span class="select-all-label">{{ allSelected ? '取消全选' : '全选' }}</span>
        <span class="trash-count">共 {{ trashNotes.length }} 篇</span>
      </div>
      <div v-for="note in trashNotes" :key="note.id" class="trash-item" :class="{ selected: selectedIds.has(note.id) }">
        <el-checkbox :model-value="selectedIds.has(note.id)" @change="toggleSelect(note.id)" @click.stop />
        <div class="trash-info" @click="toggleSelect(note.id)">
          <span class="trash-title">{{ note.title || '无标题' }}</span>
          <span class="trash-date">{{ formatRelative(note.updated_at) }}</span>
        </div>
        <div class="trash-actions">
          <el-button size="small" @click="handleRestore(note.id)">恢复</el-button>
          <el-button size="small" type="danger" @click="handlePermanentDelete(note.id)">彻底删除</el-button>
        </div>
      </div>
    </div>

    <div v-if="batchDeleting" class="batch-overlay">
      <div class="batch-dialog">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>正在删除...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trash-view {
  padding: 24px;
  height: 100%;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.view-header h2 {
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trash-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.trash-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: background 0.15s;
}

.trash-item.selected {
  background: rgba(64, 158, 255, 0.08);
  border-color: var(--accent-color);
}

.trash-item.select-all-row {
  cursor: pointer;
  padding: 8px 16px;
  background: var(--hover-bg);
  border: none;
  border-radius: 6px;
}

.select-all-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.trash-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary);
}

.trash-info {
  display: flex;
  gap: 16px;
  align-items: center;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.trash-title {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash-date {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.trash-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--text-tertiary);
  gap: 12px;
}

.batch-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.batch-dialog {
  background: var(--el-bg-color, #fff);
  border-radius: 12px;
  padding: 32px 40px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
</style>
