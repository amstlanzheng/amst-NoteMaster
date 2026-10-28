<script setup lang="ts">
/**
 * AI 助手 - 右侧聊天面板
 *
 * - 多会话：新增 / 删除 / 选择 / 清空
 * - 多模型：底部下拉切换当前模型，可打开配置弹窗
 * - 流式输出：逐字显示，支持停止
 * - 文件操作：解析 AI 回复中的 amnote-action 块，展示为卡片，确认后执行
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAiStore, DEFAULT_SYSTEM_PROMPT, type AiChatMessage } from '../../stores/ai'
import { splitAiContent, describeAction, type AiFileAction, type AiContentSegment } from '../../utils/fileFormat'
import { renderMarkdown } from '../../utils/markdown'
import AiModelDialog from './AiModelDialog.vue'

const props = defineProps<{
  currentFilePath: string
  getFileContent: () => string
}>()

const emit = defineEmits<{
  (e: 'files-changed'): void
}>()

const aiStore = useAiStore()
const input = ref('')
const streaming = ref(false)
const requestId = ref('')
const activeSessionId = ref('')
const modelDialogVisible = ref(false)
const executedKeys = ref<Set<string>>(new Set())
const messagesRef = ref<HTMLElement | null>(null)

const messages = computed(() => aiStore.currentMessages)
const currentModelLabel = computed(() => aiStore.currentModel?.name || '未配置模型')

let unlisteners: Array<() => void> = []

// ============ 流式事件 ============

function streamingMessage(): AiChatMessage | null {
  const s = aiStore.sessions.find(x => x.id === activeSessionId.value)
  if (!s || s.messages.length === 0) return null
  const last = s.messages[s.messages.length - 1]
  return last.role === 'assistant' ? last : null
}

function handleChunk(p: { requestId: string; delta: string }) {
  if (p.requestId !== requestId.value) return
  const msg = streamingMessage()
  if (msg) {
    msg.content += p.delta
    scrollToBottom()
  }
}

function handleReasoning(p: { requestId: string; delta: string }) {
  if (p.requestId !== requestId.value) return
  const msg = streamingMessage()
  if (msg) msg.reasoning = (msg.reasoning || '') + p.delta
}

function handleDone(p: { requestId: string }) {
  if (p.requestId !== requestId.value) return
  const msg = streamingMessage()
  if (msg) msg.pending = false
  streaming.value = false
  requestId.value = ''
  scrollToBottom()
}

function handleError(p: { requestId: string; message: string }) {
  if (p.requestId !== requestId.value) return
  const msg = streamingMessage()
  if (msg) {
    msg.pending = false
    msg.error = true
    msg.content += (msg.content ? '\n\n' : '') + '❌ ' + p.message
  }
  streaming.value = false
  requestId.value = ''
  scrollToBottom()
}

onMounted(() => {
  unlisteners.push(window.api.onAiChunk(handleChunk))
  unlisteners.push(window.api.onAiReasoning(handleReasoning))
  unlisteners.push(window.api.onAiDone(handleDone))
  unlisteners.push(window.api.onAiError(handleError))
  scrollToBottom()
})

onUnmounted(() => {
  unlisteners.forEach(fn => fn())
  unlisteners = []
})

watch(() => aiStore.currentSessionId, () => scrollToBottom())

// ============ 发送 ============

/** 组装发送给模型的消息（含系统提示、当前文件上下文与最近历史） */
function buildMessages(latest: string): Array<{ role: string; content: string }> {
  const msgs: Array<{ role: string; content: string }> = [
    { role: 'system', content: DEFAULT_SYSTEM_PROMPT }
  ]

  if (props.currentFilePath) {
    let ctx = `当前打开的文件绝对路径：${props.currentFilePath}`
    try {
      const c = props.getFileContent()
      if (c && c.length) {
        const truncated = c.length > 8000 ? c.slice(0, 8000) + '\n...(内容过长已截断)' : c
        ctx += `\n\n文件当前内容：\n\`\`\`\n${truncated}\n\`\`\``
      }
    } catch { /* ignore */ }
    msgs.push({ role: 'system', content: ctx })
  }

  // 最近 20 条历史（排除正在生成的末尾占位）
  const history = aiStore.currentSession?.messages || []
  const recent = history.filter(m => !m.error).slice(-21, -1)
  for (const m of recent) msgs.push({ role: m.role, content: m.content })

  msgs.push({ role: 'user', content: latest })
  return msgs
}

async function send() {
  const model = aiStore.currentModel
  if (!model || !model.baseUrl || !model.model) {
    ElMessage.warning('请先配置 AI 模型')
    modelDialogVisible.value = true
    return
  }
  const text = input.value.trim()
  if (!text) return
  if (streaming.value) {
    ElMessage.warning('正在生成中，请稍候')
    return
  }

  aiStore.appendMessage({ role: 'user', content: text })
  input.value = ''
  aiStore.appendMessage({ role: 'assistant', content: '', pending: true })

  activeSessionId.value = aiStore.currentSessionId
  requestId.value = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  streaming.value = true
  scrollToBottom()

  try {
    await window.api.aiChatStream({
      requestId: requestId.value,
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
      model: model.model,
      temperature: model.temperature,
      stream: true,
      messages: buildMessages(text) as any
    })
  } catch (e: any) {
    handleError({ requestId: requestId.value, message: String(e?.message || e) })
  }
}

/** 停止生成 */
async function stop() {
  if (!requestId.value) return
  try {
    await window.api.aiAbortStream(requestId.value)
  } catch { /* ignore */ }
}

/** 回车发送，Shift+回车换行 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

// ============ 会话管理 ============

function newSession() {
  aiStore.createSession()
  ElMessage.success('已新建会话')
}

async function deleteCurrentSession() {
  const s = aiStore.currentSession
  if (!s) return
  try {
    await ElMessageBox.confirm(`确定删除会话「${s.title}」？`, '删除会话', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    aiStore.deleteSession(s.id)
  } catch { /* cancel */ }
}

async function clearCurrentSession() {
  const s = aiStore.currentSession
  if (!s || s.messages.length === 0) return
  try {
    await ElMessageBox.confirm('确定清空当前会话的所有消息？', '清空会话', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning'
    })
    aiStore.clearSession(s.id)
    executedKeys.value = new Set()
  } catch { /* cancel */ }
}

// ============ 渲染与文件操作 ============

/** 将回复切分为文本/操作片段 */
function segmentsOf(msg: AiChatMessage): AiContentSegment[] {
  return splitAiContent(msg.content)
}

/** 渲染普通文本的 Markdown */
function renderText(text: string): string {
  return renderMarkdown(text)
}

function actionKey(index: number, segIndex: number): string {
  return `${aiStore.currentSessionId}_${index}_${segIndex}`
}

/** 执行单个文件操作（点击卡片按钮即为确认） */
async function executeAction(action: AiFileAction, key: string) {
  try {
    if (action.type === 'delete') {
      await ElMessageBox.confirm(`确定删除「${action.path}」？此操作不可恢复。`, '删除确认', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      })
    }

    if (action.type === 'write') {
      await window.api.saveExternalText(action.path, action.content ?? '')
    } else if (action.type === 'delete') {
      try {
        await window.api.deleteExternalFile(action.path)
      } catch {
        await window.api.deleteExternalDir(action.path)
      }
    } else if (action.type === 'rename') {
      if (!action.newPath) throw new Error('缺少 newPath 参数')
      await window.api.renameExternalPath(action.path, action.newPath)
    } else if (action.type === 'move') {
      if (!action.destDir) throw new Error('缺少 destDir 参数')
      await window.api.moveExternalPath(action.path, action.destDir)
    }

    executedKeys.value.add(key)
    ElMessage.success('已执行：' + describeAction(action))
    emit('files-changed')
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error('执行失败: ' + (e?.message || e))
    }
  }
}

function scrollToBottom() {
  nextTick(() => {
    const el = messagesRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
</script>

<template>
  <div class="ai-chat-panel">
    <!-- 顶部：会话与模型操作 -->
    <div class="chat-header">
      <el-select
        :model-value="aiStore.currentSessionId"
        size="small"
        class="session-select"
        placeholder="选择会话"
        @update:model-value="aiStore.selectSession($event)"
      >
        <el-option
          v-for="s in aiStore.sessions"
          :key="s.id"
          :label="s.title"
          :value="s.id"
        />
      </el-select>
      <el-button size="small" text title="新建会话" @click="newSession">
        <el-icon><Plus /></el-icon>
      </el-button>
      <el-button size="small" text title="清空会话" @click="clearCurrentSession">
        <el-icon><DeleteFilled /></el-icon>
      </el-button>
      <el-button size="small" text title="删除会话" @click="deleteCurrentSession">
        <el-icon><Delete /></el-icon>
      </el-button>
      <el-button size="small" text title="模型配置" @click="modelDialogVisible = true">
        <el-icon><Setting /></el-icon>
      </el-button>
    </div>

    <!-- 消息列表 -->
    <div ref="messagesRef" class="chat-messages">
      <div v-if="messages.length === 0" class="chat-empty">
        <el-icon :size="44"><ChatDotRound /></el-icon>
        <p>与 AI 对话，让它帮你阅读、编辑、创建或删除文件</p>
        <p class="tip">例如：帮我把当前 JSON 文件格式化，并补充一个 version 字段</p>
      </div>

      <div
        v-for="(msg, index) in messages"
        :key="index"
        class="chat-message"
        :class="msg.role"
      >
        <div class="avatar">
          <el-icon v-if="msg.role === 'user'"><User /></el-icon>
          <el-icon v-else><Cpu /></el-icon>
        </div>
        <div class="bubble">
          <!-- 思维链 -->
          <details v-if="msg.reasoning" class="reasoning">
            <summary>思考过程</summary>
            <pre>{{ msg.reasoning }}</pre>
          </details>

          <!-- 内容片段 -->
          <template v-for="(seg, segIndex) in segmentsOf(msg)" :key="segIndex">
            <div
              v-if="seg.type === 'text' && seg.text"
              class="md-body"
              v-html="renderText(seg.text)"
            />
            <div v-else-if="seg.type === 'action' && seg.action" class="action-card">
              <div class="action-head">
                <el-icon><Operation /></el-icon>
                <span class="action-desc">{{ describeAction(seg.action) }}</span>
              </div>
              <pre v-if="seg.action.type === 'write' && seg.action.content" class="action-preview">{{ seg.action.content.length > 600 ? seg.action.content.slice(0, 600) + '\n...(已截断)' : seg.action.content }}</pre>
              <div class="action-foot">
                <el-button
                  size="small"
                  type="primary"
                  :disabled="executedKeys.has(actionKey(index, segIndex))"
                  @click="executeAction(seg.action, actionKey(index, segIndex))"
                >
                  <el-icon><Check /></el-icon><span class="btn-text">{{ executedKeys.has(actionKey(index, segIndex)) ? '已执行' : '确认执行' }}</span>
                </el-button>
              </div>
            </div>
          </template>

          <!-- 生成中 -->
          <div v-if="msg.pending && !msg.content" class="pending">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>思考中...</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部：模型选择 + 输入 -->
    <div class="chat-footer">
      <div class="footer-models">
        <el-icon class="model-icon"><Cpu /></el-icon>
        <el-select
          :model-value="aiStore.currentModelId"
          size="small"
          class="model-select"
          placeholder="选择模型"
          @update:model-value="aiStore.setCurrentModel($event)"
        >
          <el-option
            v-for="m in aiStore.models"
            :key="m.id"
            :label="m.name"
            :value="m.id"
          />
        </el-select>
        <span class="model-name" :title="currentModelLabel">{{ currentModelLabel }}</span>
      </div>

      <div class="footer-input">
        <textarea
          v-model="input"
          class="chat-input"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          rows="3"
          @keydown="onKeydown"
        />
        <el-button v-if="streaming" type="danger" class="send-btn" @click="stop">
          <el-icon><VideoPause /></el-icon>
        </el-button>
        <el-button v-else type="primary" class="send-btn" :disabled="!input.trim()" @click="send">
          <el-icon><Promotion /></el-icon>
        </el-button>
      </div>
    </div>

    <AiModelDialog v-model="modelDialogVisible" />
  </div>
</template>

<style scoped>
.ai-chat-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);
  min-width: 0;
}
.chat-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.session-select { flex: 1; min-width: 0; }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
  padding: 0 20px;
}
.chat-empty .tip { font-size: 12px; opacity: 0.8; }

.chat-message { display: flex; gap: 8px; }
.chat-message.user { flex-direction: row-reverse; }
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--hover-bg);
  color: var(--text-secondary);
}
.chat-message.assistant .avatar { background: rgba(64, 158, 255, 0.12); color: var(--accent-color); }
.bubble {
  max-width: calc(100% - 40px);
  min-width: 0;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  background: var(--hover-bg);
  word-break: break-word;
}
.chat-message.user .bubble { background: rgba(64, 158, 255, 0.12); }

.md-body :deep(p) { margin: 0 0 6px; }
.md-body :deep(p:last-child) { margin-bottom: 0; }
.md-body :deep(pre) {
  background: var(--code-bg, rgba(0, 0, 0, 0.05));
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
}
.md-body :deep(code) { font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; }
.md-body :deep(ul), .md-body :deep(ol) { margin: 4px 0; padding-left: 20px; }

.reasoning { margin-bottom: 8px; font-size: 12px; color: var(--text-tertiary); }
.reasoning summary { cursor: pointer; }
.reasoning pre { white-space: pre-wrap; margin: 6px 0 0; font-size: 12px; }

.action-card {
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--el-bg-color-overlay, #fff);
}
.action-head { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.action-head .el-icon { color: var(--accent-color); }
.action-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.action-preview {
  margin: 8px 0 0;
  max-height: 180px;
  overflow: auto;
  background: var(--code-bg, rgba(0, 0, 0, 0.05));
  border-radius: 6px;
  padding: 8px;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: pre-wrap;
}
.action-foot { display: flex; justify-content: flex-end; margin-top: 8px; }

.pending { display: flex; align-items: center; gap: 6px; color: var(--text-tertiary); font-size: 12px; }

.chat-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  padding: 8px 10px;
}
.footer-models { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.model-icon { font-size: 14px; color: var(--text-tertiary); flex-shrink: 0; }
.model-select { width: 140px; flex-shrink: 0; }
.model-name {
  font-size: 12px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.footer-input { display: flex; gap: 6px; align-items: flex-end; }
.chat-input {
  flex: 1;
  resize: none;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  color: var(--text-primary);
  background: transparent;
  outline: none;
}
.chat-input:focus { border-color: var(--accent-color); }
.send-btn { flex-shrink: 0; }
.btn-text { margin-left: 2px; }
</style>
