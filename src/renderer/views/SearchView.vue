<script setup lang="ts">
import { ref } from 'vue'
import { useSearchStore } from '../stores/search'
import { formatRelative, stripMarkdown, truncate } from '../utils/format'
import type { SearchResult } from '@shared/types'

const searchStore = useSearchStore()
const inputKeyword = ref('')

function handleSearch() {
  if (inputKeyword.value.trim()) {
    searchStore.search(inputKeyword.value.trim())
  }
}

function handleHistoryClick(kw: string) {
  inputKeyword.value = kw
  handleSearch()
}

function selectResult(result: SearchResult) {
  // handled by note store
}
</script>

<template>
  <div class="search-view">
    <div class="search-header">
      <el-input v-model="inputKeyword" placeholder="搜索笔记..." size="large"
        clearable @keyup.enter="handleSearch">
        <template #prefix><el-icon><Search /></el-icon></template>
        <template #append>
          <el-button @click="handleSearch" :loading="searchStore.searching">搜索</el-button>
        </template>
      </el-input>
    </div>

    <div class="search-content">
      <div v-if="searchStore.keyword" class="search-results">
        <p class="result-count">找到 {{ searchStore.results.length }} 条结果</p>
        <div v-for="result in searchStore.results" :key="result.note.id"
          class="search-card" @click="selectResult(result)">
          <h4>{{ result.note.title || '无标题' }}</h4>
          <div class="result-highlight" v-html="result.highlight" />
          <div class="result-meta">
            <span>{{ formatRelative(result.note.updated_at) }}</span>
            <span v-for="tag in result.note.tags" :key="tag.id" class="result-tag">#{{ tag.name }}</span>
          </div>
        </div>
      </div>

      <div v-else class="search-placeholder">
        <div v-if="searchStore.history.length > 0" class="history-section">
          <h3>最近搜索</h3>
          <div class="history-tags">
            <el-tag v-for="h in searchStore.history" :key="h.id"
              class="history-tag" @click="handleHistoryClick(h.keyword)">
              {{ h.keyword }}
            </el-tag>
          </div>
        </div>
        <div v-else class="empty-state">
          <el-icon :size="50"><Search /></el-icon>
          <h2>全文搜索</h2>
          <p>输入关键词搜索笔记标题和内容</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-view {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-header {
  max-width: 600px;
  margin: 0 auto 24px;
  width: 100%;
}

.search-content {
  flex: 1;
  overflow: auto;
}

.result-count {
  color: var(--text-tertiary);
  margin-bottom: 16px;
  font-size: 13px;
}

.search-card {
  padding: 16px;
  margin-bottom: 8px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s;
}

.search-card:hover {
  border-color: var(--accent-color);
  box-shadow: var(--shadow-sm);
}

.search-card h4 {
  margin-bottom: 8px;
  font-size: 15px;
}

.result-highlight {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.result-highlight :deep(mark) {
  background: #fff3cd;
  color: #856404;
  padding: 1px 4px;
  border-radius: 2px;
}

.result-meta {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.result-tag {
  color: var(--accent-color);
}

.history-section {
  max-width: 600px;
  margin: 0 auto;
}

.history-section h3 {
  margin-bottom: 12px;
  color: var(--text-secondary);
}

.history-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.history-tag {
  cursor: pointer;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--text-tertiary);
  gap: 12px;
}

.empty-state h2 {
  color: var(--text-secondary);
}
</style>
