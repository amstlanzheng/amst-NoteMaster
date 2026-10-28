<script setup lang="ts">
/**
 * AI 助手 - 中间文件预览/编辑面板
 *
 * - 文本类文件：可编辑、保存、格式化（JSON/XML/HTML/CSS/代码）
 * - 图片：直接预览
 * - 其他二进制：提示不支持
 */
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { detectKind, extOf, isTextEditable, isFormattable, formatContent } from '../../utils/fileFormat'

const props = defineProps<{
  path: string
}>()

const content = ref('')
const originalContent = ref('')
const loading = ref(false)
const saving = ref(false)
const imageUrl = ref('')

const fileName = computed(() => props.path.split(/[\\/]/).pop() || '')
const kind = computed(() => (props.path ? detectKind(props.path) : 'binary'))
const editable = computed(() => !!props.path && isTextEditable(props.path))
const formattable = computed(() => !!props.path && isFormattable(props.path))
const isDirty = computed(() => editable.value && content.value !== originalContent.value)

/** 加载文件内容 */
async function load() {
  if (!props.path) {
    content.value = ''
    originalContent.value = ''
    imageUrl.value = ''
    return
  }
  loading.value = true
  try {
    if (kind.value === 'image') {
      const res: any = await window.api.readFileAsBase64(props.path)
      imageUrl.value = res?.base64 || ''
      content.value = ''
      originalContent.value = ''
    } else if (editable.value) {
      const res: any = await window.api.readTextFile(props.path)
      if (res?.error) {
        ElMessage.error(res.error)
        content.value = ''
        originalContent.value = ''
      } else {
        content.value = res.content ?? ''
        originalContent.value = content.value
      }
      imageUrl.value = ''
    } else {
      content.value = ''
      originalContent.value = ''
      imageUrl.value = ''
    }
  } catch (e) {
    console.error('[AiFileEditor] 加载失败:', e)
    ElMessage.error('读取文件失败')
  } finally {
    loading.value = false
  }
}

/** 保存当前内容 */
async function save() {
  if (!props.path || !editable.value) return
  saving.value = true
  try {
    await window.api.saveExternalText(props.path, content.value)
    originalContent.value = content.value
    ElMessage.success('已保存')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.message || e))
  } finally {
    saving.value = false
  }
}

/** 格式化当前内容 */
function format() {
  if (!formattable.value) {
    ElMessage.warning('该文件类型暂不支持格式化')
    return
  }
  try {
    content.value = formatContent(content.value, props.path)
    ElMessage.success('格式化完成，记得保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '格式化失败')
  }
}

/** 重新加载（丢弃未保存改动） */
function reload() {
  load()
}

/** Ctrl+S 保存 */
function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
  }
}

watch(() => props.path, load, { immediate: true })

defineExpose({
  /** 供聊天面板读取当前编辑中的内容作为上下文 */
  getContent: () => content.value,
  /** AI 执行文件操作后重新加载 */
  reload
})
</script>

<template>
  <div class="ai-file-editor">
    <div v-if="!path" class="editor-empty">
      <el-icon :size="48"><Document /></el-icon>
      <p>从左侧选择一个文件进行预览或编辑</p>
    </div>

    <template v-else>
      <div class="editor-header">
        <el-icon class="file-icon"><Document /></el-icon>
        <span class="file-name" :title="path">{{ fileName }}</span>
        <el-tag size="small" type="info" effect="plain">{{ extOf(path) || '无扩展名' }}</el-tag>
        <span v-if="isDirty" class="dirty-dot" title="有未保存的修改">●</span>
        <div class="header-actions">
          <el-button v-if="formattable" size="small" @click="format">
            <el-icon><MagicStick /></el-icon><span class="btn-text">格式化</span>
          </el-button>
          <el-button size="small" @click="reload">
            <el-icon><Refresh /></el-icon>
          </el-button>
          <el-button v-if="editable" size="small" type="primary" :loading="saving" @click="save">
            <el-icon><Finished /></el-icon><span class="btn-text">保存</span>
          </el-button>
        </div>
      </div>

      <div v-loading="loading" class="editor-body">
        <!-- 图片预览 -->
        <div v-if="kind === 'image'" class="image-preview">
          <img v-if="imageUrl" :src="imageUrl" :alt="fileName" />
          <el-empty v-else description="图片加载失败" />
        </div>

        <!-- 文本编辑 -->
        <textarea
          v-else-if="editable"
          v-model="content"
          class="editor-textarea"
          spellcheck="false"
          @keydown="onKeydown"
        />

        <!-- 不支持的类型 -->
        <div v-else class="editor-unsupported">
          <el-icon :size="40"><Document /></el-icon>
          <p>该文件类型不支持预览或编辑</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ai-file-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.editor-empty,
.editor-unsupported {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-tertiary);
  font-size: 13px;
}
.editor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.editor-header .file-icon { font-size: 16px; color: var(--accent-color); }
.editor-header .file-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
}
.dirty-dot { color: var(--el-color-warning, #e6a23c); font-size: 10px; }
.header-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.btn-text { margin-left: 2px; }

.editor-body { flex: 1; overflow: hidden; display: flex; }
.editor-textarea {
  flex: 1;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  padding: 12px 16px;
  font-family: 'Consolas', 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  background: transparent;
  white-space: pre;
  overflow: auto;
  tab-size: 2;
}
.image-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: auto;
}
.image-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
