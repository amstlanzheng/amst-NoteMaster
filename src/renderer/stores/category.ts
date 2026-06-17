import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Category } from '@shared/types'

export const useCategoryStore = defineStore('category', () => {
  const categories = ref<Category[]>([])
  const favoriteCategories = ref<Category[]>([])
  const loading = ref(false)
  const selectedCategoryId = ref<number | null>(null)

  async function fetchCategories() {
    loading.value = true
    try {
      categories.value = await window.api.getCategories()
    } finally {
      loading.value = false
    }
  }

  async function fetchFavorites() {
    try {
      favoriteCategories.value = await window.api.getFavoriteCategories()
    } catch { favoriteCategories.value = [] }
  }

  async function createCategory(data: Partial<Category>) {
    await window.api.createCategory(data)
    await fetchCategories()
  }

  async function updateCategory(id: number, data: Partial<Category>) {
    await window.api.updateCategory(id, data)
    await fetchCategories()
  }

  async function deleteCategory(id: number) {
    await window.api.deleteCategory(id)
    await fetchCategories()
  }

  function selectCategory(id: number | null) {
    selectedCategoryId.value = id
  }

  return {
    categories, favoriteCategories, loading, selectedCategoryId,
    fetchCategories, fetchFavorites, createCategory, updateCategory, deleteCategory, selectCategory
  }
})
