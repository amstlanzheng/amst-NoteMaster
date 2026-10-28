<script setup lang="ts">
/**
 * AI 助手页面
 *
 * 三栏布局：
 * - 左：外部文件树（新建 / 删除 / 重命名 / 移动）
 * - 中：文件预览与编辑（保存 / 格式化）
 * - 右：AI 聊天（多会话、多模型、流式输出、文件操作确认执行）
 */
import { ref, onMounted } from 'vue'
import { useAiStore } from '../stores/ai'
import AiFilePanel from '../components/ai/AiFilePanel.vue'
import AiFileEditor from '../components/ai/AiFileEditor.vue'
import AiChatPanel from '../components/ai/AiChatPanel.vue'

const aiStore = useAiStore()
const filePanelRef = ref<any>(null)
const editorRef = ref<any>(null)
const currentFilePath = ref('')

/** 左栏点击文件 → 中栏打开 */
function openFile(path: string) {
  currentFilePath.value = path
}

/** AI 执行文件操作后：刷新文件树与编辑器 */
function handleFilesChanged() {
  filePanelRef.value?.loadRoot()
  editorRef.value?.reload()
}

/** 供聊天面板读取当前编辑中的内容作为上下文 */
function currentFileContent(): string {
  return editorRef.value?.getContent?.() ?? ''
}

onMounted(() => {
  aiStore.load()
})
</script>

<template>
  <div class="ai-assistant">
    <div class="col-left">
      <AiFilePanel ref="filePanelRef" @select="openFile" />
    </div>
    <div class="col-middle">
      <AiFileEditor ref="editorRef" :path="currentFilePath" />
    </div>
    <div class="col-right">
      <AiChatPanel
        :current-file-path="currentFilePath"
        :get-file-content="currentFileContent"
        @files-changed="handleFilesChanged"
      />
    </div>
  </div>
</template>

<style scoped>
.ai-assistant {
  height: 100%;
  display: flex;
  overflow: hidden;
  background: var(--bg-primary);
}
.col-left { width: 280px; min-width: 200px; flex-shrink: 0; }
.col-middle { flex: 1; min-width: 0; }
.col-right { width: 400px; min-width: 320px; flex-shrink: 0; }
</style>
