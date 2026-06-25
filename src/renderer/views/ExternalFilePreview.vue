<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const filePath = ref('')
const fileName = ref('')
const fileType = ref('') // 'image' | 'text' | 'other'
const fileContent = ref('')
const originalContent = ref('') // 保存原始内容用于检测修改
const imageUrl = ref('')
const loading = ref(false)
const isEditing = ref(false) // 是否处于编辑模式
const isModified = ref(false) // 是否有未保存的修改

// 加载文件内容的核心逻辑
async function loadFile(path: string, name: string) {
  if (!path || !name) {
    console.error('[ExternalFilePreview] Invalid file path or name:', { path, name })
    ElMessage.error('无效的文件路径')
    return
  }
  
  console.log('[ExternalFilePreview] Loading file:', { path, name })
  filePath.value = path
  fileName.value = name
  
  // 重置状态
  fileContent.value = ''
  imageUrl.value = ''
  
  // 判断文件类型
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
  
  if (imageExts.includes(ext)) {
    fileType.value = 'image'
    await loadImage(path)
  } else if (['txt', 'md', 'js', 'ts', 'json', 'html', 'css', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'log', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'sql', 'sh', 'bat', 'ps1', 'vue', 'jsx', 'tsx', 'scss', 'less', 'graphql', 'dockerfile', 'makefile'].includes(ext)) {
    fileType.value = 'text'
    await loadTextFile(path)
  } else {
    fileType.value = 'other'
  }
}

// 监听路由变化（解决同一路由不同参数的问题）
watch(
  () => route.query,
  (newQuery) => {
    const path = newQuery.path as string
    const name = newQuery.name as string
    if (path && name) {
      loadFile(path, name)
    }
  },
  { immediate: true }
)

async function loadImage(path: string) {
  loading.value = true
  try {
    console.log('[ExternalFilePreview] Loading image:', path)
    const result = await window.api.readFileAsBase64(path)
    console.log('[ExternalFilePreview] Image load result:', result)
    if (result.base64) {
      imageUrl.value = result.base64
    } else if (result.error) {
      console.error('[ExternalFilePreview] Image load error:', result.error)
      ElMessage.error(`加载图片失败: ${result.error}`)
    } else {
      ElMessage.error('加载图片失败')
    }
  } catch (error) {
    console.error('[ExternalFilePreview] Load image exception:', error)
    ElMessage.error('加载图片失败')
  } finally {
    loading.value = false
  }
}

async function loadTextFile(path: string) {
  loading.value = true
  try {
    console.log('[ExternalFilePreview] Loading text file:', path)
    const result = await window.api.readFileAsBase64(path)
    console.log('[ExternalFilePreview] Text file load result:', result)
    if (result.base64) {
      // 解码 Base64
      const binaryString = atob(result.base64.split(',')[1] || result.base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      fileContent.value = new TextDecoder('utf-8').decode(bytes)
      originalContent.value = fileContent.value // 保存原始内容
      isModified.value = false
    } else if (result.error) {
      console.error('[ExternalFilePreview] Text file load error:', result.error)
      ElMessage.error(`加载文件失败: ${result.error}`)
    } else {
      ElMessage.error('加载文件失败')
    }
  } catch (error) {
    console.error('[ExternalFilePreview] Load text file exception:', error)
    ElMessage.error('加载文本文件失败')
  } finally {
    loading.value = false
  }
}

// 切换编辑模式
function toggleEdit() {
  if (isEditing.value) {
    // 退出编辑模式，恢复原始内容
    if (isModified.value) {
      ElMessageBox.confirm(
        '有未保存的修改，是否放弃？',
        '提示',
        {
          confirmButtonText: '放弃',
          cancelButtonText: '继续编辑',
          type: 'warning'
        }
      ).then(() => {
        fileContent.value = originalContent.value
        isEditing.value = false
        isModified.value = false
      }).catch(() => {
        // 用户选择继续编辑
      })
    } else {
      isEditing.value = false
    }
  } else {
    // 进入编辑模式
    isEditing.value = true
  }
}

// 监听内容变化
function onContentChange() {
  isModified.value = fileContent.value !== originalContent.value
}

// 保存文件
async function saveFile() {
  try {
    const result = await ElMessageBox.confirm(
      '确定要保存修改吗？此操作将覆盖原文件。',
      '保存确认',
      {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    if (result === 'confirm') {
      loading.value = true
      
      // 将内容转换为 Base64
      const encoder = new TextEncoder()
      const bytes = encoder.encode(fileContent.value)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      
      // 调用 API 保存文件
      const saveResult = await window.api.saveExternalFile(filePath.value, base64)
      
      if (saveResult.success) {
        ElMessage.success('文件保存成功')
        originalContent.value = fileContent.value
        isModified.value = false
        isEditing.value = false
      } else {
        ElMessage.error(`保存失败: ${saveResult.error}`)
      }
    }
  } catch (error) {
    // 用户取消
  } finally {
    loading.value = false
  }
}

// 用系统默认程序打开文件
async function openWithSystem() {
  if (!filePath.value) return
  try {
    const result = await window.api.openExternalFile(filePath.value)
    if (!result.success) {
      ElMessage.error(`打开失败: ${result.error}`)
    }
  } catch (error) {
    console.error('打开文件失败:', error)
    ElMessage.error('打开文件失败')
  }
}
</script>

<template>
  <div class="external-file-preview">
    <div class="preview-header">
      <h2>{{ fileName }}</h2>
      <el-tag size="small">{{ fileType === 'image' ? '图片' : fileType === 'text' ? '文本' : '其他' }}</el-tag>
      <el-tag v-if="isModified" size="small" type="warning">未保存</el-tag>
      
      <!-- 文本文件的操作按钮 -->
      <template v-if="fileType === 'text'">
        <el-button 
          v-if="!isEditing" 
          size="small" 
          type="primary"
          @click="toggleEdit"
        >
          编辑
        </el-button>
        <template v-else>
          <el-button 
            size="small" 
            @click="toggleEdit"
          >
            取消
          </el-button>
          <el-button 
            size="small" 
            type="success"
            :disabled="!isModified"
            @click="saveFile"
          >
            保存
          </el-button>
        </template>
      </template>
      
      <!-- 用系统默认程序打开 -->
      <el-button size="small" @click="openWithSystem">用系统程序打开</el-button>
    </div>
    
    <div v-if="loading" class="loading-container">
      <el-skeleton :rows="10" animated />
    </div>
    
    <div v-else-if="fileType === 'image'" class="image-preview">
      <img v-if="imageUrl" :src="imageUrl" :alt="fileName" class="preview-image" />
      <el-empty v-else description="无法加载图片" />
    </div>
    
    <div v-else-if="fileType === 'text'" class="text-preview">
      <!-- 预览模式 -->
      <pre v-if="!isEditing" class="text-content">{{ fileContent }}</pre>
      
      <!-- 编辑模式 -->
      <textarea 
        v-else
        v-model="fileContent"
        class="text-editor"
        @input="onContentChange"
        spellcheck="false"
      ></textarea>
    </div>
    
    <div v-else class="other-preview">
      <el-empty description="该文件类型暂不支持预览">
        <template #image>
          <el-icon :size="80" color="var(--text-tertiary)">
            <Document />
          </el-icon>
        </template>
        <template #default>
          <el-button type="primary" @click="openWithSystem">用系统默认程序打开</el-button>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<style scoped>
.external-file-preview {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.preview-header h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  flex: 1;
}

.loading-container {
  padding: 20px;
}

.image-preview {
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.preview-image {
  max-width: 100%;
  max-height: calc(100vh - 200px);
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.text-preview {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
  max-height: calc(100vh - 200px);
}

.text-content {
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-primary);
}

.text-editor {
  width: 100%;
  min-height: 400px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}

.text-editor:focus {
  border-color: var(--accent-color);
}

.other-preview {
  padding: 60px 20px;
}
</style>
