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

  /** 本地时间戳，格式与 SQLite 的 datetime('now','localtime') 保持一致 */
  function localNow(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  /**
   * 笔记字段变更后同步树内缓存（不重新查库，也不缓存正文）。
   * 用于标题编辑、移动分类、收藏/置顶等高频操作。
   */
  function patchNote(id: number, data: Partial<Note>) {
    if (!loaded.value) return
    const note = treeNotes.value.find((n) => n.id === id)
    if (!note) return
    if (data.title !== undefined) note.title = data.title
    if (data.content_type !== undefined) note.content_type = data.content_type
    if (data.category_id !== undefined) note.category_id = data.category_id
    if (data.is_favorite !== undefined) note.is_favorite = data.is_favorite
    if (data.is_pinned !== undefined) note.is_pinned = data.is_pinned
    if (data.title !== undefined || data.content !== undefined) note.updated_at = localNow()
  }

  /** 笔记删除后从树内缓存移除，避免左侧仍显示已删文件 */
  function removeNotes(ids: number[]) {
    if (!loaded.value || ids.length === 0) return
    const set = new Set(ids)
    treeNotes.value = treeNotes.value.filter((n) => !set.has(n.id))
  }

  /** 强制重新拉取树内文件（新建、复制等无法本地补齐的场景） */
  async function refresh() {
    await fetchTreeNotes(true)
  }

  return {
    treeNotes,
    loaded,
    loading,
    notesByCategory,
    fetchTreeNotes,
    getNotesByCategory,
    patchNote,
    removeNotes,
    refresh
  }
})
