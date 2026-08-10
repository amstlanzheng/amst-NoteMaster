<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Picture, Delete } from '@element-plus/icons-vue'

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
const allFiles = ref<FileInfo[]>([])
const totalCount = ref(0)
const totalSize = ref(0)
const totalSizeFormatted = ref('0 B')

// 图片预览
const showImageViewer = ref(false)
const previewImageUrl = ref('')

// 文件选择
const selectedFiles = ref(new Set<string>())

const unreferencedFiles = computed(() => allFiles.value.filter(f => !f.referenced))
const allSelectedUnreferenced = computed(() =>
  unreferencedFiles.value.length > 0 &&
  unreferencedFiles.value.every(f => selectedFiles.value.has(f.filename))
)
const someSelected = computed(() => selectedFiles.value.size > 0)

async function loadData() {
  loading.value = true
  try {
    const result = await window.api.getAllFiles()
    categories.value = result.categories || []
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
    selectedFiles.value.clear()
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
  const newSet = new Set(selectedFiles.value)
  if (newSet.has(filename)) newSet.delete(filename)
  else newSet.add(filename)
  selectedFiles.value = newSet
}

function selectAllUnreferenced() {
  if (allSelectedUnreferenced.value) {
    selectedFiles.value = new Set()
  } else {
    selectedFiles.value = new Set(unreferencedFiles.value.map(f => f.filename))
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

async function handleBatchDelete() {
  if (selectedFiles.value.size === 0) {
    ElMessage.warning('请先选择要删除的文件')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${selectedFiles.value.size} 个文件吗？此操作不可恢复。`,
      '批量删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    let successCount = 0
    let failCount = 0
    for (const filename of selectedFiles.value) {
      const result = await window.api.deleteFile(filename)
      if (result.success) successCount++
      else failCount++
    }
    if (failCount === 0) {
      ElMessage.success(`已删除 ${successCount} 个文件`)
    } else {
      ElMessage.warning(`成功删除 ${successCount} 个，失败 ${failCount} 个（可能被引用）`)
    }
    selectedFiles.value.clear()
    await loadData()
  } catch {
    // 用户取消
  }
}

async function handleCleanUnused() {
  const unreferencedCount = unreferencedFiles.value.length
  if (unreferencedCount === 0) {
    ElMessage.info('没有未引用的文件')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将清理 ${unreferencedCount} 个未被任何笔记引用的文件，此操作不可恢复。`,
      '清理未引用文件',
      { confirmButtonText: '清理', cancelButtonText: '取消', type: 'warning' }
    )
    const result = await window.api.cleanUnusedFiles()
    ElMessage.success(`已清理 ${result.deletedCount} 个文件，释放 ${result.totalSizeFormatted}`)
    await loadData()
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
        <template v-if="someSelected">
          <el-button size="small" type="danger" @click="handleBatchDelete">
            删除选中 ({{ selectedFiles.size }})
          </el-button>
          <el-button size="small" @click="selectedFiles = new Set()">取消选择</el-button>
        </template>
        <el-button size="small" type="danger" plain @click="handleCleanUnused">清理未引用文件</el-button>
        <el-button size="small" @click="loadData">刷新</el-button>
      </div>
    </div>

    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-content">
          <div class="stat-icon">📄</div>
          <div class="stat-info">
            <div class="stat-value">{{ totalCount }}</div>
            <div class="stat-label">总文件数</div>
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-content">
          <div class="stat-icon">💾</div>
          <div class="stat-info">
            <div class="stat-value">{{ totalSizeFormatted }}</div>
            <div class="stat-label">总大小</div>
          </div>
        </div>
      </div>
      <div v-if="unreferencedFiles.length > 0" class="stat-card stat-card-warning">
        <div class="stat-content">
          <div class="stat-icon">🗑️</div>
          <div class="stat-info">
            <div class="stat-value">{{ unreferencedFiles.length }}</div>
            <div class="stat-label">未引用文件</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading-container">
      加载中...
    </div>

    <div v-else class="content-area">
      <div v-if="allFiles.length > 0" class="section">
        <div class="section-title">
          <el-icon><Document /></el-icon>
          <span>文件 ({{ allFiles.length }})</span>
          <span v-if="unreferencedFiles.length > 0" class="select-all-btn" @click="selectAllUnreferenced">
            {{ allSelectedUnreferenced ? '取消全选未引用' : '全选未引用' }}
          </span>
        </div>
        <div class="files-grid">
          <div
            v-for="file in allFiles"
            :key="file.filename"
            :class="['file-card', { selected: selectedFiles.has(file.filename) }]"
            @click="!file.referenced && toggleFileSelection(file.filename)"
          >
            <div class="file-checkbox" v-if="!file.referenced">
              <el-checkbox
                :model-value="selectedFiles.has(file.filename)"
                @change="toggleFileSelection(file.filename)"
                @click.stop
              />
            </div>
            <div class="file-header" @click.stop="previewImage(file)">
              <el-icon class="file-icon"><Picture /></el-icon>
              <span class="file-name" :title="file.filename">{{ file.filename }}</span>
            </div>
            <div class="file-meta">
              <span class="file-size">{{ file.sizeFormatted }}</span>
              <span :class="['file-status', { referenced: file.referenced }]">
                {{ file.referenced ? '已引用' : '未引用' }}
              </span>
            </div>
            <div class="file-actions" @click.stop>
              <el-button size="small" link type="primary" @click="previewImage(file)">预览</el-button>
              <el-button v-if="!file.referenced" size="small" link type="danger" @click="deleteFile(file)">删除</el-button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="allFiles.length === 0" class="empty-state">
        <el-empty description="当前目录为空" />
      </div>
    </div>

    <el-image-viewer
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stats-cards {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  flex: 1;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.stat-card-warning {
  border-color: #e6a23c;
  background: rgba(230, 162, 60, 0.05);
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
  color: var(--text-tertiary);
}

.loading-container {
  padding: 20px;
  text-align: center;
  color: var(--text-tertiary);
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
  border-bottom: 1px solid var(--border-color);
}

.select-all-btn {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--accent-color);
  cursor: pointer;
  user-select: none;
}

.select-all-btn:hover {
  text-decoration: underline;
}

.files-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.file-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s;
  cursor: default;
}

.file-card:not(.selected) .file-checkbox {
  opacity: 0.3;
}

.file-card:hover {
  border-color: var(--accent-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.file-card.selected {
  border-color: var(--accent-color);
  background: rgba(64, 158, 255, 0.08);
}

.file-checkbox {
  margin-bottom: 4px;
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
  color: var(--accent-color);
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
  color: var(--text-tertiary);
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
