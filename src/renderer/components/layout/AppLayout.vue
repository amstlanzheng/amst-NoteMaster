<script setup lang="ts">
import { onMounted } from 'vue'
import AppSidebar from './AppSidebar.vue'
import { useNoteStore } from '../../stores/note'
import { useCategoryStore } from '../../stores/category'
import { useTagStore } from '../../stores/tag'
import { useSearchStore } from '../../stores/search'

const noteStore = useNoteStore()
const categoryStore = useCategoryStore()
const tagStore = useTagStore()
const searchStore = useSearchStore()

onMounted(async () => {
  await Promise.all([
    noteStore.fetchNotes(),
    categoryStore.fetchCategories(),
    tagStore.fetchTags(),
    searchStore.fetchHistory()
  ])
})
</script>

<template>
  <div class="app-layout">
    <div class="app-sidebar">
      <AppSidebar />
    </div>
    <div class="app-main">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
}

.app-sidebar {
  width: var(--sidebar-width);
  min-width: 200px;
  max-width: 350px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.app-main {
  flex: 1;
  min-width: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
