<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import NoteList from '../components/note/NoteList.vue'
import MdEditor from '../components/editor/MdEditor.vue'
import { useNoteStore } from '../stores/note'
import { useSearchStore } from '../stores/search'

const noteStore = useNoteStore()
const searchStore = useSearchStore()

let unsubGlobalSearch: (() => void) | null = null

onMounted(() => {
  unsubGlobalSearch = window.api.onGlobalSearch(() => {
    searchStore.openSearchDialog?.()
  })
})

onUnmounted(() => {
  if (unsubGlobalSearch) unsubGlobalSearch()
})
</script>

<template>
  <div class="home-layout">
    <div class="home-list">
      <NoteList />
    </div>
    <div class="home-editor">
      <MdEditor />
    </div>
  </div>
</template>

<style scoped>
.home-layout {
  display: flex;
  height: 100%;
}

.home-list {
  width: 350px;
  min-width: 250px;
  border-right: 1px solid var(--border-color);
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
}

.home-editor {
  flex: 1;
  min-width: 400px;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
}
</style>
