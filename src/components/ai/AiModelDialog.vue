<script setup lang="ts">
/**
 * AI 助手 - 模型配置弹窗
 *
 * 支持新增 / 删除 / 编辑多个 OpenAI 兼容模型，测试连通性并设为当前使用模型。
 */
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAiStore, MODEL_PRESETS, type AiModelConfig } from '../../stores/ai'

const visible = defineModel<boolean>({ required: true })

const aiStore = useAiStore()
const editingId = ref<string>('')
const testing = ref(false)

const editing = computed<AiModelConfig | null>(
  () => aiStore.models.find(m => m.id === editingId.value) || null
)

watch(visible, (v) => {
  if (v) {
    editingId.value = aiStore.currentModelId || aiStore.models[0]?.id || ''
  }
})

function selectModel(id: string) {
  editingId.value = id
}

/** 新增自定义模型 */
function addModel() {
  const m = aiStore.addModel({ name: '自定义模型', baseUrl: 'https://', model: '' })
  editingId.value = m.id
}

/** 从内置预设新增（同名则直接选中） */
function addPreset(preset: AiModelConfig) {
  const exist = aiStore.models.find(m => m.baseUrl === preset.baseUrl)
  if (exist) {
    editingId.value = exist.id
    ElMessage.info('该预设已存在，已为你选中')
    return
  }
  const m = aiStore.addModel({ ...preset })
  editingId.value = m.id
}

async function removeModel() {
  if (!editing.value) return
  try {
    await ElMessageBox.confirm(`确定删除模型「${editing.value.name}」？`, '删除模型', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    aiStore.deleteModel(editing.value.id)
    editingId.value = aiStore.models[0]?.id || ''
  } catch { /* cancel */ }
}

function updateField(field: keyof AiModelConfig, value: any) {
  if (editing.value) aiStore.updateModel(editing.value.id, { [field]: value } as any)
}

function setCurrent() {
  if (editing.value) {
    aiStore.setCurrentModel(editing.value.id)
    ElMessage.success(`已切换到「${editing.value.name}」`)
  }
}

async function testConnection() {
  const m = editing.value
  if (!m) return
  if (!m.baseUrl || !m.model) {
    ElMessage.warning('请先填写接口地址与模型名')
    return
  }
  testing.value = true
  try {
    await window.api.aiTestConnection(m.baseUrl, m.apiKey, m.model)
    ElMessage.success('连接成功')
  } catch (e: any) {
    ElMessage.error('连接失败: ' + (e?.message || e))
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="AI 模型配置" width="720px" append-to-body>
    <div class="model-config">
      <!-- 左侧模型列表 -->
      <div class="model-list">
        <div class="list-head">
          <span>模型列表</span>
          <el-button size="small" text title="新增自定义模型" @click="addModel">
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>
        <el-scrollbar class="list-scroll">
          <div
            v-for="m in aiStore.models"
            :key="m.id"
            class="model-item"
            :class="{ active: m.id === editingId }"
            @click="selectModel(m.id)"
          >
            <el-icon><Cpu /></el-icon>
            <span class="name">{{ m.name }}</span>
            <el-icon v-if="m.id === aiStore.currentModelId" class="using" title="当前使用"><Check /></el-icon>
          </div>
        </el-scrollbar>

        <div class="preset-block">
          <div class="preset-title">快捷添加预设</div>
          <div class="preset-tags">
            <el-tag
              v-for="p in MODEL_PRESETS"
              :key="p.id"
              class="preset-tag"
              size="small"
              effect="plain"
              @click="addPreset(p)"
            >{{ p.name }}</el-tag>
          </div>
        </div>
      </div>

      <!-- 右侧编辑表单 -->
      <div class="model-form">
        <template v-if="editing">
          <el-form label-width="88px" size="default">
            <el-form-item label="名称">
              <el-input :model-value="editing.name" @update:model-value="updateField('name', $event)" />
            </el-form-item>
            <el-form-item label="接口地址">
              <el-input
                :model-value="editing.baseUrl"
                placeholder="如 https://api.deepseek.com"
                @update:model-value="updateField('baseUrl', $event)"
              />
            </el-form-item>
            <el-form-item label="API Key">
              <el-input
                :model-value="editing.apiKey"
                type="password"
                show-password
                placeholder="sk-..."
                @update:model-value="updateField('apiKey', $event)"
              />
            </el-form-item>
            <el-form-item label="模型名">
              <el-input
                :model-value="editing.model"
                placeholder="如 deepseek-chat"
                @update:model-value="updateField('model', $event)"
              />
            </el-form-item>
            <el-form-item label="温度">
              <el-slider
                :model-value="editing.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                show-input
                @update:model-value="updateField('temperature', $event)"
              />
            </el-form-item>
          </el-form>

          <div class="form-actions">
            <el-button :loading="testing" @click="testConnection">
              <el-icon><Connection /></el-icon><span class="btn-text">测试连接</span>
            </el-button>
            <el-button type="danger" plain @click="removeModel">
              <el-icon><Delete /></el-icon><span class="btn-text">删除</span>
            </el-button>
            <el-button type="primary" @click="setCurrent">
              <el-icon><Check /></el-icon><span class="btn-text">设为当前模型</span>
            </el-button>
          </div>
        </template>
        <el-empty v-else description="请选择或新增一个模型" :image-size="70" />
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.model-config { display: flex; gap: 16px; height: 420px; }
.model-list {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
}
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 8px;
  font-size: 13px;
  font-weight: 600;
}
.list-scroll { flex: 1; }
.model-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.model-item:hover { background: var(--hover-bg); }
.model-item.active { background: var(--active-bg); color: var(--accent-color); }
.model-item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-item .using { color: var(--el-color-success, #67c23a); }
.preset-block { padding: 8px; border-top: 1px solid var(--border-color); }
.preset-title { font-size: 12px; color: var(--text-tertiary); margin-bottom: 6px; }
.preset-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.preset-tag { cursor: pointer; }
.model-form { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.form-actions { margin-top: auto; display: flex; justify-content: flex-end; gap: 8px; }
.btn-text { margin-left: 2px; }
</style>
