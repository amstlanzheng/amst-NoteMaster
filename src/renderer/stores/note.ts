import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Note, FilterOptions } from '@shared/types'
import { useUiStore } from './ui'

export const useNoteStore = defineStore('note', () => {
  const notes = ref<Note[]>([])
  const currentNote = ref<Note | null>(null)
  const loading = ref(false)
  const filters = ref<FilterOptions>({})

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
    await fetchNotes()
    return id
  }

  async function updateNote(id: number, data: Partial<Note>) {
    await window.api.updateNote(id, toPlain(data))
    if (currentNote.value?.id === id) {
      currentNote.value = { ...currentNote.value, ...data }
    }
    await fetchNotes()
  }

  async function deleteNote(id: number, permanent?: boolean) {
    await window.api.deleteNote(id, permanent)
    if (currentNote.value?.id === id) {
      currentNote.value = null
    }
    await fetchNotes()
  }

  async function batchDeleteNotes(ids: number[], permanent?: boolean) {
    await window.api.batchDeleteNotes(ids, permanent)
    if (currentNote.value && ids.includes(currentNote.value.id)) {
      currentNote.value = null
    }
    await fetchNotes()
  }

  async function duplicateNote(id: number) {
    await window.api.duplicateNote(id)
    await fetchNotes()
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
    notes, currentNote, loading, filters, filteredNotes,
    fetchNotes, fetchNote, createNote, updateNote, deleteNote, batchDeleteNotes, duplicateNote,
    setFilters, clearFilters
  }
})
