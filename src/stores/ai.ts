/**
 * AI 助手状态管理
 *
 * - 模型配置：支持内置预设（DeepSeek / Kimi / 通义 / OpenAI 等）与自定义，持久化到 localStorage
 * - 会话管理：新增 / 删除 / 选择会话，消息持久化到 localStorage
 * - 默认系统提示词：约定 AI 通过 ```amnote-action 代码块输出文件操作，供前端确认后执行
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

/** 模型配置 */
export interface AiModelConfig {
  id: string
  name: string
  /** OpenAI 兼容接口地址，例如 https://api.deepseek.com */
  baseUrl: string
  apiKey: string
  /** 模型名，例如 deepseek-chat */
  model: string
  temperature: number
}

/** 聊天消息 */
export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** 思维链（如 deepseek-reasoner） */
  reasoning?: string
  /** 是否为错误提示 */
  error?: boolean
  /** 是否正在流式生成中 */
  pending?: boolean
}

/** 会话 */
export interface AiSession {
  id: string
  title: string
  messages: AiChatMessage[]
  createdAt: number
  updatedAt: number
}

/** 内置模型预设（apiKey 需用户自行填写） */
export const MODEL_PRESETS: AiModelConfig[] = [
  { id: 'preset-deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat', temperature: 0.7 },
  { id: 'preset-kimi', name: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', apiKey: '', model: 'moonshot-v1-8k', temperature: 0.7 },
  { id: 'preset-qwen', name: '通义千问（阿里云）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', model: 'qwen-plus', temperature: 0.7 },
  { id: 'preset-openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.7 },
]

/** 默认系统提示词：约定文件操作协议 */
export const DEFAULT_SYSTEM_PROMPT = [
  '你是 AmNote 的 AI 文件助手，帮助用户阅读、编辑、创建、删除本地文件。',
  '当用户要求修改文件时，请在回复中包含文件操作代码块，格式如下（语言标记必须是 amnote-action）：',
  '',
  '```amnote-action',
  '{"type":"write","path":"文件的绝对路径","content":"文件的完整新内容"}',
  '```',
  '',
  '支持的操作类型：',
  '- write：创建或覆盖文件，需 path、content',
  '- delete：删除文件或文件夹，需 path',
  '- rename：重命名，需 path、newPath（同目录下的新绝对路径）',
  '- move：移动，需 path、destDir（目标文件夹绝对路径）',
  '',
  '说明：',
  '- 路径请使用当前打开文件所在目录的绝对路径。',
  '- 一次可输出多个 amnote-action 代码块，每个代表一个操作。',
  '- 代码块之外用简体中文简要解释你的思路。',
  '- 用户确认后系统才会真正执行，你无需担心，但请确保内容正确完整。'
].join('\n')

const MODELS_KEY = 'amnote-ai-models'
const CURRENT_MODEL_KEY = 'amnote-ai-current-model'
const SESSIONS_KEY = 'amnote-ai-sessions'
const CURRENT_SESSION_KEY = 'amnote-ai-current-session'

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const useAiStore = defineStore('ai', () => {
  const models = ref<AiModelConfig[]>([])
  const currentModelId = ref<string>('')
  const sessions = ref<AiSession[]>([])
  const currentSessionId = ref<string>('')

  const currentModel = computed<AiModelConfig | null>(
    () => models.value.find(m => m.id === currentModelId.value) || null
  )

  const currentSession = computed<AiSession | null>(
    () => sessions.value.find(s => s.id === currentSessionId.value) || null
  )

  const currentMessages = computed<AiChatMessage[]>(() => currentSession.value?.messages || [])

  // ============ 持久化 ============

  let loaded = false

  function load() {
    if (loaded) return
    loaded = true
    try {
      const rawModels = localStorage.getItem(MODELS_KEY)
      models.value = rawModels ? JSON.parse(rawModels) : []
      if (models.value.length === 0) {
        // 首次使用：写入内置预设
        models.value = MODEL_PRESETS.map(m => ({ ...m }))
      }
      currentModelId.value = localStorage.getItem(CURRENT_MODEL_KEY) || models.value[0]?.id || ''

      const rawSessions = localStorage.getItem(SESSIONS_KEY)
      sessions.value = rawSessions ? JSON.parse(rawSessions) : []
      currentSessionId.value = localStorage.getItem(CURRENT_SESSION_KEY) || ''
      if (sessions.value.length === 0) {
        createSession()
      } else if (!sessions.value.some(s => s.id === currentSessionId.value)) {
        currentSessionId.value = sessions.value[0].id
      }
    } catch {
      models.value = MODEL_PRESETS.map(m => ({ ...m }))
      createSession()
    }
  }

  watch(models, () => {
    try { localStorage.setItem(MODELS_KEY, JSON.stringify(models.value)) } catch {}
  }, { deep: true })

  watch(currentModelId, () => {
    try { localStorage.setItem(CURRENT_MODEL_KEY, currentModelId.value) } catch {}
  })

  watch(sessions, () => {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.value)) } catch {}
  }, { deep: true })

  watch(currentSessionId, () => {
    try { localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId.value) } catch {}
  })

  // ============ 模型管理 ============

  function addModel(config?: Partial<AiModelConfig>): AiModelConfig {
    const model: AiModelConfig = {
      id: genId('model'),
      name: config?.name || '自定义模型',
      baseUrl: config?.baseUrl || '',
      apiKey: config?.apiKey || '',
      model: config?.model || '',
      temperature: config?.temperature ?? 0.7
    }
    models.value.push(model)
    return model
  }

  function updateModel(id: string, patch: Partial<AiModelConfig>) {
    const m = models.value.find(x => x.id === id)
    if (m) Object.assign(m, patch)
  }

  function deleteModel(id: string) {
    const idx = models.value.findIndex(m => m.id === id)
    if (idx < 0) return
    models.value.splice(idx, 1)
    if (currentModelId.value === id) {
      currentModelId.value = models.value[0]?.id || ''
    }
  }

  function setCurrentModel(id: string) {
    currentModelId.value = id
  }

  // ============ 会话管理 ============

  function createSession(): AiSession {
    const session: AiSession = {
      id: genId('session'),
      title: '新会话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    return session
  }

  function deleteSession(id: string) {
    const idx = sessions.value.findIndex(s => s.id === id)
    if (idx < 0) return
    sessions.value.splice(idx, 1)
    if (currentSessionId.value === id) {
      if (sessions.value.length === 0) createSession()
      else currentSessionId.value = sessions.value[0].id
    }
  }

  function selectSession(id: string) {
    currentSessionId.value = id
  }

  function clearSession(id: string) {
    const s = sessions.value.find(x => x.id === id)
    if (s) {
      s.messages = []
      s.updatedAt = Date.now()
    }
  }

  function appendMessage(msg: AiChatMessage) {
    const s = currentSession.value
    if (!s) return
    s.messages.push(msg)
    s.updatedAt = Date.now()
    if (s.title === '新会话' && msg.role === 'user') {
      s.title = msg.content.slice(0, 20) || '新会话'
    }
  }

  return {
    models, currentModelId, sessions, currentSessionId,
    currentModel, currentSession, currentMessages,
    load, addModel, updateModel, deleteModel, setCurrentModel,
    createSession, deleteSession, selectSession, clearSession, appendMessage
  }
})
