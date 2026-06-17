<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Tag } from '@shared/types'
import { useTagStore } from '../stores/tag'

const tagStore = useTagStore()
const dialogVisible = ref(false)
const dialogTitle = ref('新建标签')
const editingTag = ref<Partial<Tag>>({ name: '', color: '#409EFF' })

const colorOptions = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#3f51b5', '#2196f3', '#00bcd4', '#009688',
  '#4caf50', '#8bc34a', '#ff9800', '#ff5722'
]

function openCreate() {
  dialogTitle.value = '新建标签'
  editingTag.value = { name: '', color: '#409EFF' }
  dialogVisible.value = true
}

function openEdit(tag: Tag) {
  dialogTitle.value = '编辑标签'
  editingTag.value = { id: tag.id, name: tag.name, color: tag.color }
  dialogVisible.value = true
}

function handleSave() {
  if (editingTag.value.id) {
    tagStore.updateTag(editingTag.value.id, { name: editingTag.value.name, color: editingTag.value.color })
  } else {
    tagStore.createTag({ name: editingTag.value.name, color: editingTag.value.color })
  }
  dialogVisible.value = false
}

function handleDelete(tag: Tag) {
  tagStore.deleteTag(tag.id)
}

onMounted(() => {
  tagStore.fetchTags()
})
</script>

<template>
  <div class="tag-view">
    <div class="view-header">
      <h2>标签管理</h2>
      <el-button type="primary" size="small" @click="openCreate">新建标签</el-button>
    </div>
    <div class="tag-grid">
      <div v-for="tag in tagStore.tags" :key="tag.id" class="tag-card">
        <span class="tag-dot" :style="{ background: tag.color }"></span>
        <span class="tag-name">{{ tag.name }}</span>
        <div class="tag-actions">
          <el-button size="small" text @click="openEdit(tag)">编辑</el-button>
          <el-button size="small" text type="danger" @click="handleDelete(tag)">删除</el-button>
        </div>
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="400px">
      <el-form label-position="top">
        <el-form-item label="名称">
          <el-input v-model="editingTag.name" placeholder="标签名称" />
        </el-form-item>
        <el-form-item label="颜色">
          <div class="color-picker">
            <div v-for="c in colorOptions" :key="c" class="color-option"
              :class="{ selected: editingTag.color === c }"
              :style="{ background: c }"
              @click="editingTag.color = c" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tag-view {
  padding: 24px;
  height: 100%;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.view-header h2 {
  font-size: 20px;
  font-weight: 600;
}

.tag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.tag-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.tag-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tag-name {
  flex: 1;
  font-weight: 500;
}

.tag-actions {
  display: flex;
  gap: 4px;
}

.color-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.color-option {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.15s;
}

.color-option:hover { transform: scale(1.2); }
.color-option.selected { border-color: var(--text-primary); }
</style>
