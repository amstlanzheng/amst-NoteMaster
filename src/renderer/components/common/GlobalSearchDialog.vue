<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUiStore } from '../../stores/ui'
import { useSearchStore } from '../../stores/search'
import { useNoteStore } from '../../stores/note'
import { useRouter } from 'vue-router'

const uiStore = useUiStore()
const searchStore = useSearchStore()
const noteStore = useNoteStore()
const router = useRouter()

const visible = ref(false)
const keyword = ref('')

watch(() => uiStore.searchDialogVisible, (val) => {
  visible.value = val
  if (val) keyword.value = ''
})

watch(visible, (val) => {
  if (!val) uiStore.closeSearchDialog()
})

function handleSearch() {
  if (keyword.value.trim()) {
    visible.value = false
    router.push('/search')
    searchStore.search(keyword.value.trim())
  }
}

function handleOpenNote(id: number) {
  visible.value = false
  noteStore.fetchNote(id)
  router.push('/')
}

const quickResults = ref<any[]>([])

watch(keyword, async (val) => {
  if (val.trim().length >= 2) {
    quickResults.value = await window.api.search(val)
  } else {
    quickResults.value = []
  }
})
</script>

<template>
  <el-dialog v-model="visible" title="全局搜索" width="600px" :show-close="true" top="15vh">
    <el-input v-model="keyword" placeholder="搜索笔记... (Ctrl+Shift+F)"
      size="large" clearable @keyup.enter="handleSearch">
      <template #prefix><el-icon><Search /></el-icon></template>
    </el-input>
    <div v-if="quickResults.length > 0" class="quick-results">
      <div v-for="r in quickResults" :key="r.note.id" class="quick-item"
        @click="handleOpenNote(r.note.id)">
        <div class="quick-title">{{ r.note.title || '无标题' }}</div>
        <div class="quick-highlight" v-html="r.highlight" />
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" @click="handleSearch">搜索全部</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.quick-results {
  margin-top: 16px;
  max-height: 300px;
  overflow: auto;
}
.quick-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
}
.quick-item:hover { background: var(--hover-bg); }
.quick-title { font-weight: 500; margin-bottom: 4px; }
.quick-highlight { font-size: 12px; color: var(--text-secondary); }
.quick-highlight :deep(mark) { background: #fff3cd; padding: 1px 3px; border-radius: 2px; }
</style>
