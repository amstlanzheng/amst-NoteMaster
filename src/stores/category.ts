import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Category } from '@shared/types'

export const useCategoryStore = defineStore('category', () => {
  const categories = ref<Category[]>([])
  const favoriteCategories = ref<Category[]>([])
  const loading = ref(false)
  const selectedCategoryId = ref<number | null>(null)

  // 分类导航历史
  const categoryHistory = ref<(number | null)[]>([])

  // 记录分类切换历史
  watch(selectedCategoryId, (newId, oldId) => {
    if (oldId !== undefined && oldId !== newId) {
      categoryHistory.value.push(oldId)
      if (categoryHistory.value.length > 50) {
        categoryHistory.value.shift()
      }
    }
  })

  // 返回上级分类
  function goBackCategory(): number | null {
    if (categoryHistory.value.length === 0) return null
    return categoryHistory.value.pop()!
  }

  // 获取当前分类的父分类 ID，找不到返回 undefined
  function getParentCategoryId(catId: number | null): number | null | undefined {
    if (catId === null) return undefined
    const findParent = (cats: Category[], targetId: number, parentId: number | null): number | null | undefined => {
      for (const c of cats) {
        if (c.id === targetId) return parentId
        if (c.children) {
          const found = findParent(c.children, targetId, c.id)
          if (found !== undefined) return found
        }
      }
      return undefined
    }
    return findParent(categories.value, catId, null)
  }

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
    categories, favoriteCategories, loading, selectedCategoryId, categoryHistory,
    fetchCategories, fetchFavorites, createCategory, updateCategory, deleteCategory, selectCategory,
    goBackCategory, getParentCategoryId
  }
})
