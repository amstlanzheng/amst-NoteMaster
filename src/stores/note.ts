import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Note, FilterOptions } from '@shared/types'
import { useUiStore } from './ui'
import { useNoteTreeStore } from './noteTree'
import { useCategoryStore } from './category'

export const useNoteStore = defineStore('note', () => {
  const notes = ref<Note[]>([])
  const currentNote = ref<Note | null>(null)
  const loading = ref(false)
  const filters = ref<FilterOptions>({})

  // 笔记访问历史
  const noteHistory = ref<number[]>([])
  const MAX_HISTORY = 50

  // 记录笔记访问历史
  watch(currentNote, (newNote, oldNote) => {
    if (oldNote && oldNote.id !== newNote?.id) {
      // 将上一个笔记 ID 加入历史
      noteHistory.value.push(oldNote.id)
      if (noteHistory.value.length > MAX_HISTORY) {
        noteHistory.value.shift()
      }
    }
  })

  // 返回上一个笔记
  function goBackNote(): number | null {
    if (noteHistory.value.length === 0) return null
    return noteHistory.value.pop()!
  }

  const filteredNotes = computed(() => {
    return notes.value
  })

  function toPlain(obj: unknown) {
    return obj ? JSON.parse(JSON.stringify(obj)) : undefined
  }

  async function fetchNotes(filter?: FilterOptions) {
    loading.value = true
    try {
      const f = { ...toPlain(filter || filters.value) }
      const ui = useUiStore()
      f.sort_by = ui.noteSortBy
      f.sort_order = ui.noteSortOrder
      notes.value = await window.api.getNotes(f)
    } finally {
      loading.value = false
    }
  }

  async function fetchNote(id: number) {
    currentNote.value = await window.api.getNote(id)
    return currentNote.value
  }

  async function createNote(data: Partial<Note>) {
    const id = await window.api.createNote(toPlain(data))
    // 同步左侧分类树与分类文件计数，否则新笔记不会出现在侧边栏
    await Promise.all([
      fetchNotes(),
      useNoteTreeStore().fetchTreeNotes(true),
      useCategoryStore().fetchCategories()
    ])
    return id
  }

  async function updateNote(id: number, data: Partial<Note>) {
    await window.api.updateNote(id, toPlain(data))
    if (currentNote.value?.id === id) {
      currentNote.value = { ...currentNote.value, ...data }
    }
    // 标题 / 分类 / 收藏 / 置顶变化需即时反映到左侧文件树
    useNoteTreeStore().patchNote(id, data)
    if (data.category_id !== undefined) {
      await useCategoryStore().fetchCategories()
    }
    await fetchNotes()
  }

  async function deleteNote(id: number, permanent?: boolean) {
    await window.api.deleteNote(id, permanent)
    if (currentNote.value?.id === id) {
      currentNote.value = null
    }
    useNoteTreeStore().removeNotes([id])
    await Promise.all([fetchNotes(), useCategoryStore().fetchCategories()])
  }

  async function batchDeleteNotes(ids: number[], permanent?: boolean) {
    await window.api.batchDeleteNotes(ids, permanent)
    if (currentNote.value && ids.includes(currentNote.value.id)) {
      currentNote.value = null
    }
    useNoteTreeStore().removeNotes(ids)
    await Promise.all([fetchNotes(), useCategoryStore().fetchCategories()])
  }

  async function duplicateNote(id: number) {
    await window.api.duplicateNote(id)
    await Promise.all([
      fetchNotes(),
      useNoteTreeStore().fetchTreeNotes(true),
      useCategoryStore().fetchCategories()
    ])
  }

  function setFilters(filter: FilterOptions) {
    filters.value = { ...filters.value, ...filter }
    fetchNotes()
  }

  function clearFilters() {
    filters.value = {}
    fetchNotes()
  }

  return {
    notes, currentNote, loading, filters, filteredNotes, noteHistory,
    fetchNotes, fetchNote, createNote, updateNote, deleteNote, batchDeleteNotes, duplicateNote,
    setFilters, clearFilters, goBackNote
  }
})
