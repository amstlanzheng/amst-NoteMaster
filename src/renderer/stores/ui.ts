import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const sidebarWidth = ref(250)
  const listWidth = ref(350)
  const isDarkMode = ref(false)
  const searchDialogVisible = ref(false)

  function toggleDarkMode() {
    isDarkMode.value = !isDarkMode.value
    document.documentElement.classList.toggle('dark', isDarkMode.value)
  }

  function openSearchDialog() {
    searchDialogVisible.value = true
  }

  function closeSearchDialog() {
    searchDialogVisible.value = false
  }

  return {
    sidebarWidth, listWidth, isDarkMode, searchDialogVisible,
    toggleDarkMode, openSearchDialog, closeSearchDialog
  }
})
