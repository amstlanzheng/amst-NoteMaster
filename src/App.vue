<script setup lang="ts">
import { onMounted } from 'vue'
import AppLayout from './components/layout/AppLayout.vue'
import GlobalSearchDialog from './components/common/GlobalSearchDialog.vue'
import { useUiStore } from './stores/ui'

const uiStore = useUiStore()

onMounted(() => {
  uiStore.loadSettings()
})
</script>

<template>
  <AppLayout />
  <GlobalSearchDialog />
</template>
