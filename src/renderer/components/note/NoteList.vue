<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useNoteStore } from '../../stores/note'
import { useCategoryStore } from '../../stores/category'
import { useTagStore } from '../../stores/tag'
import { useUiStore } from '../../stores/ui'
import { formatRelative, stripMarkdown, truncate } from '../../utils/format'
import type { Note, Category } from '@shared/types'

const noteStore = useNoteStore()
const categoryStore = useCategoryStore()
const tagStore = useTagStore()
const uiStore = useUiStore()

const noteContextMenu = ref({ visible: false, x: 0, y: 0, note: null as Note | null })
const batchMode = ref(false)
const selectedIds = ref<Set<number>>(new Set())

// 当前选中分类的直接子分类（用于在列表中显示为文件夹）
const childCategories = computed(() => {
  if (categoryStore.selectedCategoryId === null || categoryStore.selectedCategoryId === undefined) {
    // 未分类/全部笔记：不显示子分类文件夹
    return []
  }
  // 找到当前选中的分类
  const findCat = (cats: Category[]): Category | null => {
    for (const c of cats) {
      if (c.id === categoryStore.selectedCategoryId) return c
      if (c.children) {
        const found = findCat(c.children)
        if (found) return found
      }
    }
    return null
  }
  const current = findCat(categoryStore.categories)
  return current?.children || []
})

// 在分类树中查找分类（含层级）
function findCategoryInTree(cats: Category[], id: number): Category | null {
  for (const c of cats) {
    if (c.id === id) return c
    if (c.children) {
      const found = findCategoryInTree(c.children, id)
      if (found) return found
    }
  }
  return null
}

// 点击子分类文件夹
function enterSubCategory(catId: number) {
  categoryStore.selectCategory(catId)
  noteStore.setFilters({ category_id: catId })
}

const currentCategoryName = computed(() => {
  if (categoryStore.selectedCategoryId === null || categoryStore.selectedCategoryId === undefined) {
    return '全部笔记'
  }
  const cat = findCategoryInTree(categoryStore.categories, categoryStore.selectedCategoryId)
  return cat?.name || '未分类'
})

// 组合显示当前筛选条件（分类 + 标签）
const currentFilterTitle = computed(() => {
  let title = currentCategoryName.value
  
  // 如果有标签筛选，追加标签名称
  const tagId = noteStore.filters.tag_id
  if (tagId && tagId !== 0) {
    // 从 tagStore 中查找标签名称
    const tag = tagStore.tags.find(t => t.id === tagId)
    if (tag) {
      title += ` / 标签： ${tag.name}`
    }
  } else if (tagId === 0) {
    title += ' / 无标签'
  }
  
  return title
})

// 获取笔记所属的子分类名称（如果当前选中的是父分类）
function getSubCategoryName(note: Note): string | null {
  if (!note.category_id || !categoryStore.selectedCategoryId) return null
  // 如果笔记的分类就是当前选中的分类，不显示
  if (note.category_id === categoryStore.selectedCategoryId) return null
  
  // 查找分类名称
  const findCategoryName = (cats: any[], targetId: number): string | null => {
    for (const c of cats) {
      if (c.id === targetId) return c.name
      if (c.children) {
        const found = findCategoryName(c.children, targetId)
        if (found) return found
      }
    }
    return null
  }
  
  return findCategoryName(categoryStore.categories, note.category_id)
}

const sortedNotes = computed(() => {
  const arr = [...noteStore.notes]
  return arr.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
})

const listState = computed<'loading' | 'empty' | 'notes'>(() => {
  if (noteStore.loading) return 'loading'
  if (sortedNotes.value.length === 0) return 'empty'
  return 'notes'
})

function selectNote(note: Note) {
  noteStore.currentNote = note
}

async function handleNewNote() {
  try {
    const id = await noteStore.createNote({
      title: '新笔记',
      content: '',
      category_id: categoryStore.selectedCategoryId
    })
    await noteStore.fetchNote(id)
  } catch (e: any) {
    ElMessage.error('创建失败: ' + (e?.message || '未知错误'))
  }
}

function getPreview(note: Note): string {
  return truncate(stripMarkdown(note.content || ''), 100) || '空笔记'
}

function handleNoteContextMenu(event: MouseEvent, note: Note) {
  event.preventDefault()
  event.stopPropagation()
  noteContextMenu.value = { visible: true, x: event.clientX, y: event.clientY, note }
  setTimeout(() => { document.addEventListener('click', closeNoteMenu, { once: true }) }, 0)
}

function closeNoteMenu() {
  noteContextMenu.value.visible = false
}

async function menuRename() {
  const note = noteContextMenu.value.note
  if (!note) return
  closeNoteMenu()
  try {
    const { value } = await ElMessageBox.prompt('新的笔记名称', '重命名', {
      confirmButtonText: '确定', cancelButtonText: '取消', inputValue: note.title
    })
    if (value?.trim()) {
      try { await window.api.renameNote(note.id, value.trim()) } catch { /* mock */ }
      await noteStore.fetchNotes()
      if (noteStore.currentNote?.id === note.id) noteStore.currentNote.title = value.trim()
      ElMessage.success('已重命名')
    }
  } catch { /* cancel */ }
}

async function menuExportMd() {
  const note = noteContextMenu.value.note
  if (!note) return
  closeNoteMenu()
  try {
    const result = await window.api.exportNoteMd(note.id)
    if (result) {
      // 如果有图片，导出为 ZIP
      if (result.images && result.images.length > 0) {
        await exportSingleNoteAsZip(result.title, result.content, result.images)
      } else {
        // 没有图片，直接下载 MD 文件
        downloadText(result.content, `${result.title}.md`, 'text/markdown')
      }
    }
  } catch {
    downloadText(`---\ntitle: "${note.title}"\ndate: ${note.updated_at}\n---\n\n${note.content}`, `${note.title}.md`, 'text/markdown')
  }
  ElMessage.success('Markdown 已导出')
}

async function exportSingleNoteAsZip(title: string, content: string, images: Array<{ filename: string; base64: string }>) {
  try {
    let JSZip: any
    
    try {
      const jszipModule = await import('jszip')
      JSZip = jszipModule.default || jszipModule
    } catch {
      if (!(window as any).JSZip) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
          script.onload = () => resolve(true)
          script.onerror = reject
          document.head.appendChild(script)
        })
      }
      JSZip = (window as any).JSZip
    }
    
    if (!JSZip) throw new Error('JSZip 加载失败')
    
    const zip = new JSZip()
    // 不创建根文件夹,直接将MD和图片放在ZIP根目录
    
    // 添加 Markdown 文件到根目录
    zip.file(`${title}.md`, content)
    
    // 添加图片文件夹和图片到根目录
    if (images.length > 0) {
      const imagesFolder = zip.folder('images')
      if (!imagesFolder) throw new Error('创建图片文件夹失败')
      
      for (const image of images) {
        const binaryString = atob(image.base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let j = 0; j < binaryString.length; j++) {
          bytes[j] = binaryString.charCodeAt(j)
        }
        imagesFolder.file(image.filename, bytes)
      }
    }
    
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title}.zip`
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Export as ZIP failed:', error)
    ElMessage.error('导出 ZIP 失败')
  }
}

async function menuExportHtml() {
  const note = noteContextMenu.value.note
  if (!note) return
  closeNoteMenu()
  try {
    const result = await window.api.exportNoteHtml(note.id)
    if (result) {
      // 如果有图片，导出为 ZIP
      if (result.images && result.images.length > 0) {
        await exportSingleNoteAsZip(result.title, result.content, result.images)
      } else {
        // 没有图片，直接下载 HTML 文件
        downloadText(result.content, `${result.title}.html`, 'text/html')
      }
    }
  } catch {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${note.title}</title><style>body{max-width:800px;margin:0 auto;padding:40px 20px;font-family:sans-serif;font-size:16px;line-height:1.8}</style></head><body><pre>${note.content}</pre></body></html>`
    downloadText(html, `${note.title}.html`, 'text/html')
  }
  ElMessage.success('HTML 已导出')
}

async function menuDelete() {
  const note = noteContextMenu.value.note
  if (!note) return
  closeNoteMenu()
  try {
    await ElMessageBox.confirm(`确定删除「${note.title}」？将移入回收站。`, '删除笔记', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    await noteStore.deleteNote(note.id)
    ElMessage.success('已移入回收站')
  } catch { /* cancel */ }
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function onDragStart(event: DragEvent, note: Note) {
  event.dataTransfer!.setData('text/note-id', String(note.id))
  event.dataTransfer!.effectAllowed = 'move'
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  if (!batchMode.value) {
    selectedIds.value = new Set()
  }
}

function toggleSelect(note: Note, e: MouseEvent) {
  e.stopPropagation()
  const newSet = new Set(selectedIds.value)
  if (newSet.has(note.id)) {
    newSet.delete(note.id)
  } else {
    newSet.add(note.id)
  }
  selectedIds.value = newSet
}

function selectAll() {
  if (selectedIds.value.size === sortedNotes.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(sortedNotes.value.map(n => n.id))
  }
}

async function batchDelete() {
  const count = selectedIds.value.size
  if (count === 0) {
    ElMessage.warning('请先选择要删除的笔记')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${count} 篇笔记？将移入回收站。`,
      '批量删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    for (const id of selectedIds.value) {
      await noteStore.deleteNote(id)
    }
    selectedIds.value = new Set()
    batchMode.value = false
    ElMessage.success(`已删除 ${count} 篇笔记`)
  } catch { /* cancel */ }
}
</script>

<template>
  <div class="note-list">
    <div class="list-header">
      <span class="list-title">{{ currentFilterTitle }}</span>
      <div class="header-actions">
        <el-button v-if="!batchMode" size="small" text @click="toggleBatchMode">批量</el-button>
        <template v-if="batchMode">
          <el-button size="small" @click="selectAll">{{ selectedIds.size === sortedNotes.length ? '取消全选' : '全选' }}</el-button>
          <el-button size="small" type="danger" :disabled="selectedIds.size === 0" @click="batchDelete">删除 ({{ selectedIds.size }})</el-button>
          <el-button size="small" @click="toggleBatchMode">取消</el-button>
        </template>
        <el-button v-if="!batchMode" type="primary" size="small" :icon="'Plus'" @click="handleNewNote">新建</el-button>
      </div>
    </div>

    <el-scrollbar class="list-content">
      <template v-if="listState === 'loading'">
        <div class="loading-state">
          <el-icon class="is-loading"><Loading /></el-icon>
        </div>
      </template>
      <template v-else>
        <!-- 子分类文件夹列表 -->
        <div v-if="childCategories.length > 0" class="sub-folder-section">
          <div
            v-for="cat in childCategories"
            :key="cat.id"
            class="sub-folder-card"
            @click="enterSubCategory(cat.id)"
          >
            <el-icon class="folder-icon"><Folder /></el-icon>
            <span class="folder-name">{{ cat.name }}</span>
            <span v-if="uiStore.showFolderCount" class="folder-count">{{ cat.note_count || 0 }}</span>
          </div>
        </div>

        <!-- 笔记列表 -->
        <template v-if="sortedNotes.length === 0 && childCategories.length > 0">
          <div class="empty-state">
            <p>当前分类暂无笔记</p>
          </div>
        </template>
        <template v-else-if="sortedNotes.length === 0 && childCategories.length === 0">
          <div class="empty-state">
            <el-icon :size="40"><Document /></el-icon>
            <p>暂无笔记</p>
            <el-button type="primary" size="small" @click="handleNewNote">创建第一篇笔记</el-button>
          </div>
        </template>
        <template v-else>
        <div v-for="note in sortedNotes" :key="note.id"
          class="note-card"
          :class="{ active: noteStore.currentNote?.id === note.id, pinned: note.is_pinned }"
          :draggable="!batchMode"
          @click="batchMode ? toggleSelect(note, $event) : selectNote(note)"
          @contextmenu="batchMode ? null : handleNoteContextMenu($event, note)"
          @dragstart="batchMode ? null : onDragStart($event, note)">
          <el-checkbox v-if="batchMode" :model-value="selectedIds.has(note.id)" class="batch-check" @change="toggleSelect(note, $event)" />
          <div class="card-body">
            <div class="card-header">
              <span class="card-title">
                <el-icon v-if="note.is_pinned" class="pin-icon"><Top /></el-icon>
                {{ note.title || '无标题' }}
              </span>
              <el-icon v-if="note.is_favorite" class="fav-icon"><StarFilled /></el-icon>
            </div>
            <div class="card-preview">{{ getPreview(note) }}</div>
            <div class="card-meta">
              <span class="card-tags" v-if="note.tags?.length">
                <span v-for="tag in note.tags" :key="tag.id" class="card-tag">
                  <span class="tag-dot" :style="{ background: tag.color }"></span>
                  {{ tag.name }}
                </span>
              </span>
              <!-- 显示子分类名称 -->
              <span v-if="getSubCategoryName(note)" class="sub-category-badge">
                <el-icon><Folder /></el-icon>
                {{ getSubCategoryName(note) }}
              </span>
              <span class="card-date">{{ formatRelative(note.updated_at) }}</span>
            </div>
          </div>
        </div>
        </template>
      </template>
    </el-scrollbar>

    <Teleport to="body">
      <div v-if="noteContextMenu.visible" class="context-menu-overlay" :style="{ left: noteContextMenu.x + 'px', top: noteContextMenu.y + 'px' }" @click.stop>
        <div class="context-menu-item" @click="menuRename">
          <el-icon><Edit /></el-icon> 重命名
        </div>
        <div class="context-menu-item" @click="menuExportMd">
          <el-icon><Download /></el-icon> 导出 Markdown
        </div>
        <div class="context-menu-item" @click="menuExportHtml">
          <el-icon><Download /></el-icon> 导出 HTML
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" @click="menuDelete">
          <el-icon><Delete /></el-icon> 删除
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.note-list { height: 100%; display: flex; flex-direction: column; }
.list-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border-color); }
.header-actions { display: flex; align-items: center; gap: 6px; }
.list-title { font-size: 15px; font-weight: 600; }
.list-content { flex: 1; }
.note-card { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--border-color); transition: background 0.15s ease; user-select: none; display: flex; align-items: flex-start; gap: 10px; }
.card-body { flex: 1; min-width: 0; }
.batch-check { flex-shrink: 0; margin-top: 2px; }
.note-card:hover { background: var(--hover-bg); }
.note-card.active { background: var(--active-bg); border-left: 3px solid var(--accent-color); }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.card-title { font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 4px; }
.pin-icon { color: var(--accent-color); font-size: 12px; }
.fav-icon { color: #f5a623; font-size: 12px; }
.card-preview { font-size: 12px; color: var(--text-tertiary); line-height: 1.5; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-meta { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text-tertiary); gap: 8px; }
.card-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.sub-category-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(64, 158, 255, 0.1);
  border-radius: 10px;
  color: var(--accent-color);
  font-weight: 500;
  font-size: 11px;
  white-space: nowrap;
}
.sub-category-badge .el-icon {
  font-size: 12px;
}
.card-tag { 
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 10px;
  color: var(--text-secondary);
  font-weight: 500;
}
.card-tag .tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
:root.dark .card-tag {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}
.loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: var(--text-tertiary); gap: 12px; }

/* 子文件夹区域 */
.sub-folder-section {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
}

.sub-folder-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 13px;
  color: var(--text-secondary);
}

.sub-folder-card:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.sub-folder-card:last-child {
  margin-bottom: 0;
}

.folder-icon {
  font-size: 16px;
  color: var(--accent-color);
  flex-shrink: 0;
}

.folder-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--hover-bg);
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  flex-shrink: 0;
}
</style>
