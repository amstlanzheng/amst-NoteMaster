<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { formatRelative, stripMarkdown, truncate } from '../utils/format'
import type { Note } from '@shared/types'

const trashNotes = ref<Note[]>([])

async function loadTrash() {
  trashNotes.value = await window.api.getTrashNotes()
}

async function handleRestore(id: number) {
  await window.api.restoreNote(id)
  loadTrash()
}

async function handlePermanentDelete(id: number) {
  await window.api.deleteNote(id, true)
  loadTrash()
}

onMounted(loadTrash)
</script>

<template>
  <div class="trash-view">
    <div class="view-header">
      <h2>回收站</h2>
    </div>
    <div v-if="trashNotes.length === 0" class="empty-state">
      <el-icon :size="50"><Delete /></el-icon>
      <p>回收站为空</p>
    </div>
    <div v-else class="trash-list">
      <div v-for="note in trashNotes" :key="note.id" class="trash-item">
        <div class="trash-info">
          <span class="trash-title">{{ note.title || '无标题' }}</span>
          <span class="trash-date">{{ formatRelative(note.updated_at) }}</span>
        </div>
        <div class="trash-actions">
          <el-button size="small" @click="handleRestore(note.id)">恢复</el-button>
          <el-button size="small" type="danger" @click="handlePermanentDelete(note.id)">彻底删除</el-button>
        </div>
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
  margin-bottom: 24px;
}

.view-header h2 {
  font-size: 20px;
  font-weight: 600;
}

.trash-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.trash-info {
  display: flex;
  gap: 16px;
  align-items: center;
}

.trash-title {
  font-weight: 500;
}

.trash-date {
  font-size: 12px;
  color: var(--text-tertiary);
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
</style>
