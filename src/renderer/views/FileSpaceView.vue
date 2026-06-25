<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox, ElImageViewer, ElSkeleton, ElEmpty, ElButton, ElCard, ElCheckbox } from 'element-plus'
import { Folder, Document, Picture, ArrowRight } from '@element-plus/icons-vue'

interface FileInfo {
  filename: string
  size: number
  sizeFormatted: string
  modifiedTime: string
  referenced: boolean
  directCategoryId: number | null
}

interface CategoryInfo {
  id: number
  parent_id: number | null
  name: string
  sort_order: number
  directFileCount: number
  directFileSize: number
  directFileSizeFormatted: string
  childCategoryCount: number
}

const loading = ref(false)
const categories = ref<CategoryInfo[]>([])
const filesByCategory = ref<Record<string, FileInfo[]>>({})
const allFiles = ref<FileInfo[]>([])
const totalCount = ref(0)
const totalSize = ref(0)
const totalSizeFormatted = ref('0 B')

// 图片预览
const showImageViewer = ref(false)
const previewImageUrl = ref('')

// 文件选择模式
const isSelectMode = ref(false)
const selectedFiles = ref(new Set<string>())

// 当前浏览路径（不再使用子文件夹导航，始终在根目录）
const currentPath = ref<{ name: string; categoryId: number | null }>({ name: '全部文件', categoryId: null })

// 当前显示的文件列表（始终显示所有文件）
const currentFiles = computed(() => {
  return allFiles.value
})

async function loadData() {
  loading.value = true
  try {
    const result = await window.api.getAllFiles()
    categories.value = result.categories || []
    filesByCategory.value = result.filesByDirectCategory || {}
    allFiles.value = (result.allFiles || []).map((f: any) => ({
      filename: f.filename,
      size: f.size,
      sizeFormatted: f.sizeFormatted,
      modifiedTime: f.modifiedTime,
      referenced: f.referenced,
      directCategoryId: f.directCategoryId
    }))
    totalCount.value = result.totalCount || 0
    totalSize.value = result.totalSize || 0
    totalSizeFormatted.value = result.totalSizeFormatted || '0 B'
  } catch (error) {
    console.error('Failed to load files:', error)
    ElMessage.error('加载文件列表失败')
  } finally {
    loading.value = false
  }
}

function previewImage(file: FileInfo) {
  const ext = file.filename.split('.').pop()?.toLowerCase() || ''
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
  if (imageExts.includes(ext)) {
    window.api.readFileAsBase64(`amnote-data/files/${file.filename}`).then((result: any) => {
      if (result.base64) {
        previewImageUrl.value = result.base64
        showImageViewer.value = true
      } else {
        ElMessage.warning('无法预览此文件')
      }
    })
  } else {
    ElMessage.info('此文件类型不支持预览')
  }
}

function toggleFileSelection(filename: string) {
  if (selectedFiles.value.has(filename)) {
    selectedFiles.value.delete(filename)
  } else {
    selectedFiles.value.add(filename)
  }
}

async function deleteFile(file: FileInfo) {
  try {
    await ElMessageBox.confirm(
      `确定要删除文件 "${file.filename}" 吗？`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    const result = await window.api.deleteFile(file.filename)
    if (result.success) {
      ElMessage.success('文件已删除')
      await loadData()
    } else {
      ElMessage.error(result.message || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="file-space-view">
    <div class="view-header">
      <div class="header-left">
        <h2>文件空间</h2>
      </div>
      <div class="header-actions">
        <ElButton size="small" @click="loadData">刷新</ElButton>
      </div>
    </div>

    <div class="stats-cards">
      <ElCard class="stat-card">
        <div class="stat-content">
          <div class="stat-icon">📄</div>
          <div class="stat-info">
            <div class="stat-value">{{ totalCount }}</div>
            <div class="stat-label">总文件数</div>
          </div>
        </div>
      </ElCard>
      <ElCard class="stat-card">
        <div class="stat-content">
          <div class="stat-icon">💾</div>
          <div class="stat-info">
            <div class="stat-value">{{ totalSizeFormatted }}</div>
            <div class="stat-label">总大小</div>
          </div>
        </div>
      </ElCard>
    </div>

    <div v-if="loading" class="loading-container">
      <ElSkeleton :rows="5" animated />
    </div>

    <div v-else class="content-area">
      <div v-if="currentFiles.length > 0" class="section">
        <div class="section-title">
          <el-icon><Document /></el-icon>
          <span>文件 ({{ currentFiles.length }})</span>
        </div>
        <div class="files-grid">
          <div
            v-for="file in currentFiles"
            :key="file.filename"
            :class="['file-card', { selected: isSelectMode && selectedFiles.has(file.filename) }]"
          >
            <div class="file-header" @click="previewImage(file)">
              <el-icon class="file-icon"><Picture /></el-icon>
              <span class="file-name" :title="file.filename">{{ file.filename }}</span>
            </div>
            <div class="file-meta">
              <span class="file-size">{{ file.sizeFormatted }}</span>
              <span :class="['file-status', { referenced: file.referenced }]">
                {{ file.referenced ? '已引用' : '未引用' }}
              </span>
            </div>
            <div class="file-actions">
              <ElButton size="small" link type="primary" @click="previewImage(file)">预览</ElButton>
              <ElButton v-if="!file.referenced" size="small" link type="danger" @click="deleteFile(file)">删除</ElButton>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentFiles.length === 0" class="empty-state">
        <ElEmpty description="当前目录为空" />
      </div>
    </div>

    <ElImageViewer
      v-if="showImageViewer"
      :url-list="[previewImageUrl]"
      :initial-index="0"
      @close="showImageViewer = false"
    />
  </div>
</template>

<style scoped>
.file-space-view {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left h2 {
  margin: 0;
  font-size: 20px;
}

.stats-cards {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  flex: 1;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  font-size: 32px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
}

.stat-label {
  font-size: 13px;
  color: #999;
}

.loading-container {
  padding: 20px;
}

.content-area {
  margin-top: 16px;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.files-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.file-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s;
}

.file-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.file-card.selected {
  border-color: #409eff;
  background: #ecf5ff;
}

.file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 8px;
}

.file-icon {
  font-size: 20px;
  color: #409eff;
}

.file-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.file-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
}

.file-status.referenced {
  color: #67c23a;
}

.file-actions {
  display: flex;
  gap: 8px;
}

.empty-state {
  padding: 40px;
}
</style>
