import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Tag } from '@shared/types'

export const useTagStore = defineStore('tag', () => {
  const tags = ref<Tag[]>([])
  const loading = ref(false)

  async function fetchTags() {
    loading.value = true
    try {
      tags.value = await window.api.getTags()
    } finally {
      loading.value = false
    }
  }

  async function createTag(data: Partial<Tag>) {
    await window.api.createTag(data)
    await fetchTags()
  }

  async function updateTag(id: number, data: Partial<Tag>) {
    await window.api.updateTag(id, data)
    await fetchTags()
  }

  async function deleteTag(id: number) {
    await window.api.deleteTag(id)
    await fetchTags()
  }

  return { tags, loading, fetchTags, createTag, updateTag, deleteTag }
})
