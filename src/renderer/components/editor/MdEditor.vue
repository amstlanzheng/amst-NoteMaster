<script setup lang="ts">
import { ref, watch, computed } from 'vue'
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
const autoSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const previewHtml = computed(() => {
  if (contentType.value === 'html') return editContent.value
  return renderMarkdown(editContent.value)
})

const noteTags = ref<Tag[]>([])

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
      const buffer = await blob.arrayBuffer()
      const noteId = noteStore.currentNote?.id || 0
      try {
        const result = await window.api.saveLocalFile({
          buffer: Array.from(new Uint8Array(buffer)),
          filename: blob.name || 'paste.png',
          noteId
        })
        if (result.path) {
          const mdImg = `\n![](${result.path})\n`
          editContent.value += mdImg
          triggerAutoSave()
        }
      } catch {
        const reader = new FileReader()
        reader.onload = (e) => {
          editContent.value += `\n![](${e.target?.result})\n`
          triggerAutoSave()
        }
        reader.readAsDataURL(blob)
      }
      break
    }
  }
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
      <div class="edit-pane" v-if="editMode !== 'preview'">
        <textarea v-model="editContent" class="edit-textarea" placeholder="开始写作..." @input="triggerAutoSave" @paste="handlePasteImage" />
      </div>
      <div class="preview-pane" v-if="editMode !== 'edit'"
        v-html="previewHtml" />
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
    <h2>NoteMaster</h2>
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
.preview-pane :deep(pre) { background: var(--bg-secondary); padding: 16px; border-radius: 8px; overflow-x: auto; margin: 12px 0; }
.preview-pane :deep(code) { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 13px; }
.preview-pane :deep(blockquote) { border-left: 3px solid var(--accent-color); padding-left: 16px; margin: 12px 0; color: var(--text-secondary); }
.preview-pane :deep(table) { border-collapse: collapse; width: 100%; margin: 12px 0; }
.preview-pane :deep(th), .preview-pane :deep(td) { border: 1px solid var(--border-color); padding: 8px 12px; text-align: left; }
.preview-pane :deep(th) { background: var(--bg-secondary); }
.preview-pane :deep(a) { color: var(--accent-color); }
.preview-pane :deep(img) { max-width: 100%; border-radius: 8px; }

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
