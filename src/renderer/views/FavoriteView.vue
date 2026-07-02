<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNoteStore } from '../stores/note'
import { formatRelative, stripMarkdown, truncate } from '../utils/format'
import type { Note } from '@shared/types'

const noteStore = useNoteStore()
const router = useRouter()
const favNotes = ref<Note[]>([])

async function loadFavorites() {
  favNotes.value = await window.api.getNotes({ is_favorite: true })
}

async function selectNote(note: Note) {
  noteStore.currentNote = note
  noteStore.clearFilters()
  await router.push('/')
}

onMounted(loadFavorites)
</script>

<template>
  <div class="fav-view">
    <div class="view-header">
      <h2>⭐ 收藏笔记</h2>
      <span class="count">{{ favNotes.length }} 篇</span>
    </div>
    <div v-if="favNotes.length === 0" class="empty-state">
      <el-icon :size="50"><Star /></el-icon>
      <p>暂无收藏笔记</p>
    </div>
    <div v-else class="fav-list">
      <div v-for="note in favNotes" :key="note.id" class="fav-card" @click="selectNote(note)">
        <div class="fav-card-header">
          <span class="fav-title">{{ note.title || '无标题' }}</span>
          <span class="fav-date">{{ formatRelative(note.updated_at) }}</span>
        </div>
        <div class="fav-preview">{{ truncate(stripMarkdown(note.content || ''), 150) || '空笔记' }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fav-view {
  padding: 24px;
  height: 100%;
  overflow: auto;
}
.view-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.view-header h2 { font-size: 20px; font-weight: 600; }
.count { color: var(--text-tertiary); font-size: 13px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; color: var(--text-tertiary); gap: 12px; }
.fav-card { padding: 16px; margin-bottom: 8px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: pointer; transition: all 0.15s; }
.fav-card:hover { border-color: var(--accent-color); }
.fav-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.fav-title { font-weight: 600; }
.fav-date { font-size: 12px; color: var(--text-tertiary); }
.fav-preview { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
</style>
