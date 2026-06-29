import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type SortBy = 'updated_at' | 'created_at' | 'sort_weight'
export type SortOrder = 'asc' | 'desc'

export const useUiStore = defineStore('ui', () => {
  const sidebarWidth = ref(250)
  const listWidth = ref(350)
  const isDarkMode = ref(false)
  const searchDialogVisible = ref(false)
  const showFolderCount = ref(true) // 是否显示文件夹内文件数量
  const noteSortBy = ref<SortBy>('updated_at')
  const noteSortOrder = ref<SortOrder>('desc')

  // 从 localStorage 加载设置
  function loadSettings() {
    try {
      const saved = localStorage.getItem('amnote-ui-settings')
      if (saved) {
        const cfg = JSON.parse(saved)
        if (cfg.showFolderCount !== undefined) showFolderCount.value = cfg.showFolderCount
        if (cfg.noteSortBy !== undefined) noteSortBy.value = cfg.noteSortBy
        if (cfg.noteSortOrder !== undefined) noteSortOrder.value = cfg.noteSortOrder
      }
    } catch {}
  }

  // 监听设置变化并保存
  watch([showFolderCount, noteSortBy, noteSortOrder], () => {
    try {
      const saved = JSON.parse(localStorage.getItem('amnote-ui-settings') || '{}')
      saved.showFolderCount = showFolderCount.value
      saved.noteSortBy = noteSortBy.value
      saved.noteSortOrder = noteSortOrder.value
      localStorage.setItem('amnote-ui-settings', JSON.stringify(saved))
    } catch {}
  })

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
    sidebarWidth, listWidth, isDarkMode, searchDialogVisible, showFolderCount,
    noteSortBy, noteSortOrder,
    toggleDarkMode, openSearchDialog, closeSearchDialog, loadSettings
  }
})
