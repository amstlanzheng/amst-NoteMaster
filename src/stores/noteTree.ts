import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Note } from '@shared/types'

/**
 * 侧边栏「分类树内文件」数据源。
 * 与 noteStore.notes（当前筛选结果）不同，这里保存全部未删除笔记的轻量字段，
 * 供左侧分类树按 category_id 分组渲染文件。
 */
export const useNoteTreeStore = defineStore('noteTree', () => {
  const treeNotes = ref<Note[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  // category_id -> 直接归属的笔记（null/undefined 归入未分类）
  const notesByCategory = computed(() => {
    const map = new Map<number | null, Note[]>()
    for (const note of treeNotes.value) {
      const key = note.category_id ?? null
      const list = map.get(key)
      if (list) {
        list.push(note)
      } else {
        map.set(key, [note])
      }
    }
    return map
  })

  async function fetchTreeNotes(force = false) {
    if (loading.value) return
    if (loaded.value && !force) return
    loading.value = true
    try {
      // 等待数据库就绪（应用挂载后才异步初始化，避免“数据库未初始化”竞态）
      await new Promise<void>((resolve) => {
        window.api.onDbReady(() => resolve())
      })
      treeNotes.value = await window.api.getNoteTreeLite()
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  function getNotesByCategory(catId: number | null): Note[] {
    return notesByCategory.value.get(catId ?? null) || []
  }

  return {
    treeNotes,
    loaded,
    loading,
    notesByCategory,
    fetchTreeNotes,
    getNotesByCategory
  }
})
