import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SearchResult, SearchHistory } from '@shared/types'

export const useSearchStore = defineStore('search', () => {
  const results = ref<SearchResult[]>([])
  const history = ref<SearchHistory[]>([])
  const keyword = ref('')
  const searching = ref(false)

  async function search(kw: string) {
    keyword.value = kw
    searching.value = true
    try {
      results.value = await window.api.search(kw)
      await fetchHistory()
    } finally {
      searching.value = false
    }
  }

  async function fetchHistory() {
    history.value = await window.api.getSearchHistory()
  }

  function clearResults() {
    results.value = []
    keyword.value = ''
  }

  return { results, history, keyword, searching, search, fetchHistory, clearResults }
})
