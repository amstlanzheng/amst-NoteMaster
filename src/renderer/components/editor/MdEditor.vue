<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture, Delete, Close, View } from '@element-plus/icons-vue'
import { useNoteStore } from '../../stores/note'
import { useTagStore } from '../../stores/tag'
import { renderMarkdown } from '../../utils/markdown'
import type { Tag } from '@shared/types'

const noteStore = useNoteStore()
const tagStore = useTagStore()

const editTitle = ref('')
const editContent = ref('')
const editMode = ref<'edit' | 'preview' | 'split'>('edit')
const contentType = ref<'markdown' | 'html'>('markdown')

// 是否启用不换行模式（Base64 文本单行显示）
const noWrapMode = ref(true)
const autoSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const previewHtml = computed(() => {
  if (contentType.value === 'html') return editContent.value
  return renderMarkdown(editContent.value)
})

const noteTags = ref<Tag[]>([])

// Base64 图片列表
interface Base64Image {
  index: number
  format: string
  size: string
  fullMatch: string
  base64: string
  dataUrl: string
}

const base64Images = computed<Base64Image[]>(() => {
  const images: Base64Image[] = []
  const regex = /!\[\]\(data:image\/(\w+);base64,([A-Za-z0-9+/=]+)\)/g
  let match
  
  while ((match = regex.exec(editContent.value)) !== null) {
    const format = match[1].toUpperCase()
    const base64Data = match[2]
    // Base64 大小约为原始数据的 1.33 倍
    const sizeBytes = Math.round((base64Data.length * 0.75))
    const sizeKB = (sizeBytes / 1024).toFixed(1)
    
    images.push({
      index: match.index,
      format,
      size: `${sizeKB}KB`,
      fullMatch: match[0],
      base64: base64Data,
      dataUrl: `data:image/${match[1].toLowerCase()};base64,${base64Data}`
    })
  }
  
  return images
})

const showImagePanel = ref(false)

watch(() => noteStore.currentNote, (note) => {
  if (note) {
    editTitle.value = note.title || ''
    editContent.value = note.content || ''
    contentType.value = (note.content_type as 'markdown' | 'html') || 'markdown'
    noteTags.value = note.tags || []
  }
}, { immediate: true })

function doAutoSave() {
  if (!noteStore.currentNote) return
  noteStore.updateNote(noteStore.currentNote.id, {
    title: editTitle.value,
    content: editContent.value,
    content_type: contentType.value
  })
}

function triggerAutoSave() {
  if (autoSaveTimer.value) clearTimeout(autoSaveTimer.value)
  autoSaveTimer.value = setTimeout(doAutoSave, 2000)
}

watch([editTitle, editContent, contentType], () => {
  triggerAutoSave()
})

function handleDelete() {
  if (!noteStore.currentNote) return
  noteStore.deleteNote(noteStore.currentNote.id)
}

function handleDuplicate() {
  if (!noteStore.currentNote) return
  noteStore.duplicateNote(noteStore.currentNote.id)
}

function toggleFavorite() {
  if (!noteStore.currentNote) return
  noteStore.updateNote(noteStore.currentNote.id, {
    is_favorite: !noteStore.currentNote.is_favorite
  })
}

function togglePin() {
  if (!noteStore.currentNote) return
  noteStore.updateNote(noteStore.currentNote.id, {
    is_pinned: !noteStore.currentNote.is_pinned
  })
}

function insertMarkdown(syntax: string) {
  if (syntax === 'bold') editContent.value += '****'
  else if (syntax === 'italic') editContent.value += '**'
  else if (syntax === 'code') editContent.value += '\n```\n\n```\n'
  else if (syntax === 'h1') editContent.value += '\n# '
  else if (syntax === 'h2') editContent.value += '\n## '
  else if (syntax === 'h3') editContent.value += '\n### '
  else if (syntax === 'quote') editContent.value += '\n> '
  else if (syntax === 'list') editContent.value += '\n- '
  else if (syntax === 'link') editContent.value += '[]()'
  else if (syntax === 'table') editContent.value += '\n| 列1 | 列2 |\n| --- | --- |\n|  |  |\n'
  triggerAutoSave()
}

const tagDialogVisible = ref(false)
const tagSearch = ref('')

// 分栏同步滚动
const editPaneRef = ref<HTMLElement>()
const previewPaneRef = ref<HTMLElement>()
let isSyncingScroll = false

// 将 Base64 图片转换为简短占位符（用于显示）
function compressBase64InDisplay(content: string): string {
  return content.replace(
    /!\[\]\(data:image\/(\w+);base64,[A-Za-z0-9+/=]+\)/g,
    (match, format) => {
      const upperFormat = format.toUpperCase()
      return `[图片:${upperFormat}]`
    }
  )
}

function onEditPaneScroll() {
  if (isSyncingScroll || !previewPaneRef.value || editMode.value !== 'split') return
  isSyncingScroll = true
  
  const editPane = editPaneRef.value!
  const previewPane = previewPaneRef.value!
  
  // 计算滚动比例
  const scrollRatio = editPane.scrollTop / (editPane.scrollHeight - editPane.clientHeight)
  
  // 同步到预览区
  previewPane.scrollTop = scrollRatio * (previewPane.scrollHeight - previewPane.clientHeight)
  
  nextTick(() => {
    isSyncingScroll = false
  })
}

function onPreviewPaneScroll() {
  if (isSyncingScroll || !editPaneRef.value || editMode.value !== 'split') return
  isSyncingScroll = true
  
  const editPane = editPaneRef.value!
  const previewPane = previewPaneRef.value!
  
  // 计算滚动比例
  const scrollRatio = previewPane.scrollTop / (previewPane.scrollHeight - previewPane.clientHeight)
  
  // 同步到编辑区
  editPane.scrollTop = scrollRatio * (editPane.scrollHeight - editPane.clientHeight)
  
  nextTick(() => {
    isSyncingScroll = false
  })
}

const availableTags = computed(() => {
  const noteTagIds = new Set(noteTags.value.map(t => t.id))
  return tagStore.tags.filter(t => !noteTagIds.has(t.id) &&
    t.name.toLowerCase().includes(tagSearch.value.toLowerCase()))
})

function addTagToNote(tag: Tag) {
  if (!noteStore.currentNote) return
  noteTags.value.push(tag)
  window.api.addTagToNote(noteStore.currentNote.id, tag.id)
}

function removeTagFromNote(tag: Tag) {
  if (!noteStore.currentNote) return
  noteTags.value = noteTags.value.filter(t => t.id !== tag.id)
  window.api.removeTagFromNote(noteStore.currentNote.id, tag.id)
}

function showTagDialog() {
  tagSearch.value = ''
  tagDialogVisible.value = true
}

async function handlePasteImage(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const blob = item.getAsFile()
      if (!blob) continue
      
      // 检查图片大小（限制 1MB）
      const maxSize = 1024 * 1024 // 1MB
      if (blob.size > maxSize) {
        ElMessage.warning(`图片大小超过限制（${(blob.size / 1024 / 1024).toFixed(2)}MB > 1MB），请压缩后再粘贴`)
        break
      }
      
      // 获取当前图片存储模式
      const storageMode = localStorage.getItem('amnote-image-storage-mode') || 'base64'
      
      try {
        if (storageMode === 'folder') {
          // 文件夹存储模式：保存图片到本地并返回路径
          const arrayBuffer = await blob.arrayBuffer()
          const buffer = Array.from(new Uint8Array(arrayBuffer))
          const result = await window.api.saveLocalFile({
            buffer,
            filename: `pasted_${Date.now()}.${blob.type.split('/')[1] || 'png'}`,
            noteId: noteStore.currentNote!.id
          })
          
          if (result.error) {
            throw new Error(result.error)
          }
          
          const mdImg = `\n![](${result.path})\n`
          editContent.value += mdImg
          triggerAutoSave()
          ElMessage.success('图片已插入（文件夹存储）')
        } else {
          // Base64 存储模式：直接嵌入
          const base64 = await fileToBase64(blob)
          const mdImg = `\n![](${base64})\n`
          editContent.value += mdImg
          triggerAutoSave()
          ElMessage.success('图片已插入（Base64 格式）')
        }
      } catch (error) {
        console.error('Failed to insert image:', error)
        ElMessage.error('图片插入失败')
      }
      break
    }
  }
}

// 将 File/Blob 转换为 Base64
function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 显示图片详情
function showImageDetail(img: Base64Image) {
  ElMessageBox({
    title: `图片详情 (${img.format}, ${img.size})`,
    message: `
      <div style="text-align: center;">
        <img src="${img.dataUrl}" style="max-width: 100%; max-height: 400px; border-radius: 8px;" />
        <p style="margin-top: 12px; color: var(--text-secondary);">格式: ${img.format} | 大小: ${img.size}</p>
      </div>
    `,
    dangerouslyUseHTMLString: true,
    confirmButtonText: '关闭'
  })
}

// 迅速滚动到顶部
function scrollToTop() {
  if (editPaneRef.value) {
    editPaneRef.value.scrollTop = 0
  }
  if (previewPaneRef.value) {
    previewPaneRef.value.scrollTop = 0
  }
}

// 迅速滚动到底部
function scrollToBottom() {
  if (editPaneRef.value) {
    editPaneRef.value.scrollTop = editPaneRef.value.scrollHeight
  }
  if (previewPaneRef.value) {
    previewPaneRef.value.scrollTop = previewPaneRef.value.scrollHeight
  }
}

// 删除图片
function removeImage(img: Base64Image) {
  ElMessageBox.confirm(
    `确定要删除这张图片吗？（${img.format}, ${img.size}）`,
    '删除图片',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    // 从内容中移除该图片的 Markdown 语法
    editContent.value = editContent.value.replace(img.fullMatch, '')
    triggerAutoSave()
    ElMessage.success('图片已删除')
  }).catch(() => {
    // 用户取消
  })
}
</script>

<template>
  <div class="editor" v-if="noteStore.currentNote">
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <el-button-group size="small">
          <el-button :type="editMode === 'edit' ? 'primary' : 'default'" @click="editMode = 'edit'">编辑</el-button>
          <el-button :type="editMode === 'preview' ? 'primary' : 'default'" @click="editMode = 'preview'">预览</el-button>
          <el-button :type="editMode === 'split' ? 'primary' : 'default'" @click="editMode = 'split'">分栏</el-button>
        </el-button-group>
        <el-divider direction="vertical" />
        <el-button size="small" @click="insertMarkdown('h1')">H1</el-button>
        <el-button size="small" @click="insertMarkdown('h2')">H2</el-button>
        <el-button size="small" @click="insertMarkdown('h3')">H3</el-button>
        <el-button size="small" @click="insertMarkdown('bold')"><b>B</b></el-button>
        <el-button size="small" @click="insertMarkdown('italic')"><i>I</i></el-button>
        <el-button size="small" @click="insertMarkdown('code')">&lt;/&gt;</el-button>
        <el-button size="small" @click="insertMarkdown('quote')">&ldquo;</el-button>
        <el-button size="small" @click="insertMarkdown('list')">•</el-button>
        <el-button size="small" @click="insertMarkdown('link')">🔗</el-button>
        <el-button size="small" @click="insertMarkdown('table')">⊞</el-button>
      </div>
      <div class="toolbar-right">
        <el-select v-model="contentType" size="small" style="width:100px">
          <el-option label="Markdown" value="markdown" />
          <el-option label="HTML" value="html" />
        </el-select>
        <el-button 
          size="small" 
          :type="noWrapMode ? 'primary' : 'default'"
          @click="noWrapMode = !noWrapMode"
          title="切换不换行模式"
        >
          <el-icon><View /></el-icon>
          {{ noWrapMode ? '不换行' : '自动换行' }}
        </el-button>
        <el-button 
          size="small" 
          :type="showImagePanel ? 'primary' : 'default'"
          @click="showImagePanel = !showImagePanel"
        >
          <el-icon><Picture /></el-icon>
          图片 {{ base64Images.length > 0 ? `(${base64Images.length})` : '' }}
        </el-button>
        <el-button size="small" @click="scrollToTop" title="回到顶部">
          <el-icon><Top /></el-icon>
        </el-button>
        <el-button size="small" @click="scrollToBottom" title="到底部">
          <el-icon><Bottom /></el-icon>
        </el-button>
        <el-button size="small" @click="showTagDialog">标签</el-button>
        <el-button size="small" :type="noteStore.currentNote.is_favorite ? 'warning' : 'default'"
          @click="toggleFavorite">⭐</el-button>
        <el-button size="small" :type="noteStore.currentNote.is_pinned ? 'primary' : 'default'"
          @click="togglePin">📌</el-button>
        <el-button size="small" @click="handleDuplicate">复制</el-button>
        <el-button size="small" type="danger" @click="handleDelete">删除</el-button>
      </div>
    </div>

    <input v-model="editTitle" class="editor-title" placeholder="笔记标题..." @input="triggerAutoSave" />

    <div class="editor-content" :class="`mode-${editMode}`">
      <div class="edit-pane" v-if="editMode !== 'preview'" ref="editPaneRef" @scroll="onEditPaneScroll">
        <textarea 
          v-model="editContent" 
          :class="['edit-textarea', { 'no-wrap': noWrapMode }]" 
          placeholder="开始写作..." 
          @input="triggerAutoSave" 
          @paste="handlePasteImage"
        />
      </div>
      <div class="preview-pane" v-if="editMode !== 'edit'" ref="previewPaneRef" @scroll="onPreviewPaneScroll"
        v-html="previewHtml" />
    </div>

    <!-- Base64 图片列表面板 -->
    <div v-if="showImagePanel && base64Images.length > 0" class="image-panel">
      <div class="image-panel-header">
        <span class="image-panel-title">Base64 图片 ({{ base64Images.length }})</span>
        <el-button size="small" text @click="showImagePanel = false">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
      <div class="image-list">
        <div 
          v-for="(img, index) in base64Images" 
          :key="index"
          class="image-item"
          @click="showImageDetail(img)"
        >
          <div class="image-preview">
            <img :src="img.dataUrl" :alt="`图片 ${index + 1}`" />
          </div>
          <div class="image-info">
            <span class="image-format">{{ img.format }}</span>
            <span class="image-size">{{ img.size }}</span>
          </div>
          <el-button 
            size="small" 
            type="danger" 
            text
            @click.stop="removeImage(img)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <div class="note-tags-bar" v-if="noteTags.length">
      <el-tag v-for="tag in noteTags" :key="tag.id" :color="tag.color"
        closable size="small" @close="removeTagFromNote(tag)">
        {{ tag.name }}
      </el-tag>
    </div>

    <el-dialog v-model="tagDialogVisible" title="管理标签" width="450px">
      <div class="tag-section">
        <div class="current-tags">
          <el-tag v-for="tag in noteTags" :key="tag.id" 
            :style="{ background: tag.color, borderColor: tag.color, color: '#FFFFFF' }"
            closable size="large" @close="removeTagFromNote(tag)">
            <span style="font-weight: 600; font-size: 14px;">{{ tag.name }}</span>
          </el-tag>
        </div>
        <el-divider />
        <el-input v-model="tagSearch" placeholder="搜索标签..." size="default" clearable />
        <div class="available-tags">
          <el-tag v-for="tag in availableTags" :key="tag.id" 
            :style="{ background: tag.color, borderColor: tag.color, color: '#FFFFFF' }"
            size="large" class="clickable-tag" @click="addTagToNote(tag)">
            <span style="font-weight: 600; font-size: 14px;">+ {{ tag.name }}</span>
          </el-tag>
        </div>
      </div>
    </el-dialog>
  </div>

  <div class="editor-empty" v-else>
    <el-icon :size="60"><Document /></el-icon>
    <h2>AmNote</h2>
    <p>选择或创建一篇笔记开始写作</p>
  </div>
</template>

<style scoped>
.editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  gap: 12px;
}

.editor-empty h2 {
  color: var(--text-secondary);
  font-size: 24px;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.editor-title {
  width: 100%;
  padding: 16px 24px;
  font-size: 22px;
  font-weight: 600;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
}

.editor-title::placeholder {
  color: var(--text-tertiary);
}

.editor-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.mode-edit .edit-pane { flex: 1; }
.mode-preview .preview-pane { flex: 1; }
.mode-split .edit-pane { flex: 1; border-right: 1px solid var(--border-color); }
.mode-split .preview-pane { flex: 1; }

.edit-pane, .preview-pane {
  overflow: auto;
  /* 启用平滑滚动 */
  scroll-behavior: smooth;
}

.edit-textarea {
  width: 100%;
  height: 100%;
  padding: 16px 24px;
  border: none;
  outline: none;
  resize: none;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
  background: transparent;
}

/* 不换行模式：Base64 文本单行显示 + 横向滚动 */
.edit-textarea.no-wrap {
  white-space: pre; /* 保持空格和换行，但不自动换行 */
  overflow-x: auto; /* 启用横向滚动 */
}

.edit-textarea::placeholder {
  color: var(--text-tertiary);
}

.preview-pane {
  padding: 16px 24px;
  line-height: 1.8;
}

.preview-pane :deep(h1) { font-size: 28px; margin: 16px 0 8px; }
.preview-pane :deep(h2) { font-size: 22px; margin: 16px 0 8px; }
.preview-pane :deep(h3) { font-size: 18px; margin: 12px 0 6px; }
.preview-pane :deep(p) { margin: 8px 0; }
.preview-pane :deep(pre) { 
  background: var(--bg-secondary); 
  padding: 16px; 
  border-radius: 8px; 
  overflow-x: auto; 
  margin: 12px 0;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.6;
}
.preview-pane :deep(pre code) { 
  font-family: inherit;
  font-size: inherit;
  color: var(--text-primary);
  background: transparent;
  padding: 0;
}
.preview-pane :deep(code) { 
  font-family: 'Cascadia Code', 'Fira Code', monospace; 
  font-size: 13px;
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-primary);
}
.preview-pane :deep(blockquote) { border-left: 3px solid var(--accent-color); padding-left: 16px; margin: 12px 0; color: var(--text-secondary); }
.preview-pane :deep(table) { border-collapse: collapse; width: 100%; margin: 12px 0; }
.preview-pane :deep(th), .preview-pane :deep(td) { border: 1px solid var(--border-color); padding: 8px 12px; text-align: left; }
.preview-pane :deep(th) { background: var(--bg-secondary); }
.preview-pane :deep(a) { color: var(--accent-color); }
.preview-pane :deep(img) { max-width: 100%; border-radius: 8px; }

/* Base64 图片列表面板 */
.image-panel {
  max-height: 300px;
  overflow-y: auto;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.image-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-color);
}

.image-panel-title {
  font-weight: 600;
  color: var(--text-primary);
}

.image-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 24px;
}

.image-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.image-item:hover {
  border-color: var(--accent-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.image-preview {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.image-format {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.image-size {
  font-size: 11px;
  color: var(--text-tertiary);
}

.note-tags-bar {
  display: flex;
  gap: 6px;
  padding: 8px 24px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-wrap: wrap;
}

.current-tags, .available-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 0;
}

.clickable-tag {
  cursor: pointer;
}
</style>
