<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUiStore } from '../stores/ui'
import { useNoteStore } from '../stores/note'
import { useCategoryStore } from '../stores/category'
import { useTagStore } from '../stores/tag'
import type { SftpConfig } from '@shared/types'

const uiStore = useUiStore()
const noteStore = useNoteStore()
const categoryStore = useCategoryStore()
const tagStore = useTagStore()

const importing = ref(false)
const importResult = ref('')
const dbPath = ref('')
const cleaningFiles = ref(false)
const cleanResult = ref('')

const syncConfig = ref<SftpConfig>({ host: '', port: 22, username: '', password: '', remotePath: '/notemaster-data' })
const syncAuthMode = ref<'password' | 'key'>('password')
const syncKeyContent = ref('')
const syncStatus = ref<'idle' | 'testing' | 'syncing' | 'connected' | 'error'>('idle')
const syncMessage = ref('')
const syncLastSync = ref('')
const closeBehavior = ref<'quit' | 'minimize'>('quit')
const isPasswordSaved = ref(false)

function loadSshConfig() {
  try {
    const saved = localStorage.getItem('notemaster-ssh-config')
    if (saved) {
      const cfg = JSON.parse(saved)
      if (cfg.host) syncConfig.value.host = cfg.host
      if (cfg.port) syncConfig.value.port = cfg.port
      if (cfg.username) syncConfig.value.username = cfg.username
      if (cfg.remotePath) syncConfig.value.remotePath = cfg.remotePath
      if (cfg.authMode) syncAuthMode.value = cfg.authMode
      // 加载保存的密码或密钥
      if (cfg.password) {
        syncConfig.value.password = cfg.password
        isPasswordSaved.value = true
      }
      if (cfg.privateKey) {
        syncKeyContent.value = cfg.privateKey
        isPasswordSaved.value = true
      }
    }
  } catch {}
}

function saveSshConfig(saveCredentials = false) {
  try {
    const configToSave: any = {
      host: syncConfig.value.host,
      port: syncConfig.value.port,
      username: syncConfig.value.username,
      remotePath: syncConfig.value.remotePath,
      authMode: syncAuthMode.value
    }
    // 只有当用户明确选择保存时才保存密码/密钥
    if (saveCredentials) {
      if (syncAuthMode.value === 'password' && syncConfig.value.password) {
        configToSave.password = syncConfig.value.password
      }
      if (syncAuthMode.value === 'key' && syncKeyContent.value) {
        configToSave.privateKey = syncKeyContent.value
      }
      isPasswordSaved.value = true
    }
    localStorage.setItem('notemaster-ssh-config', JSON.stringify(configToSave))
  } catch {}
}

function clearSavedCredentials() {
  try {
    const saved = localStorage.getItem('notemaster-ssh-config')
    if (saved) {
      const cfg = JSON.parse(saved)
      // 保留非敏感信息，删除密码和密钥
      delete cfg.password
      delete cfg.privateKey
      localStorage.setItem('notemaster-ssh-config', JSON.stringify(cfg))
    }
    // 清空当前表单中的敏感信息
    syncConfig.value.password = ''
    syncKeyContent.value = ''
    isPasswordSaved.value = false
    ElMessage.success('已清除保存的连接信息')
  } catch {}
}

function loadCloseBehavior() {
  try {
    const saved = localStorage.getItem('notemaster-close-behavior')
    if (saved === 'minimize' || saved === 'quit') {
      closeBehavior.value = saved
      // 通知主进程当前的关闭行为设置
      window.api.setCloseBehavior?.(saved)
    }
  } catch {}
}

function saveCloseBehavior() {
  try { localStorage.setItem('notemaster-close-behavior', closeBehavior.value) } catch {}
  window.api.setCloseBehavior?.(closeBehavior.value)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

async function exportAllData() {
  try {
    const data = await window.api.exportAllData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    downloadBlob(blob, `notemaster-full-backup-${timestamp}.json`)
    ElMessage.success('完整数据已导出')
  } catch {
    const data = buildExportFromMemory()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    downloadBlob(blob, `notemaster-full-backup-${timestamp}.json`)
    ElMessage.success('完整数据已导出（浏览器模式）')
  }
}

function buildExportFromMemory() {
  return {
    version: '1.0', exported_at: new Date().toISOString(),
    notes: noteStore.notes, categories: categoryStore.categories, tags: tagStore.tags,
    note_tags: noteStore.notes.flatMap(n => (n.tags || []).map(t => ({ note_id: n.id, tag_id: t.id }))),
    note_versions: []
  }
}

async function exportMarkdownZip() {
  let md = ''
  for (const note of noteStore.notes) {
    if (note.is_deleted) continue
    md += `---\ntitle: "${note.title}"\ndate: ${note.updated_at}\ncategory: ${note.category?.name || '未分类'}\n`
    if (note.tags?.length) md += `tags: [${note.tags.map(t => t.name).join(', ')}]\n`
    md += `---\n\n${note.content}\n\n`
  }
  const blob = new Blob([md], { type: 'text/markdown' })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  downloadBlob(blob, `notemaster-notes-${timestamp}.md`)
  ElMessage.success('Markdown 已导出')
}

function triggerImportFile() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.json'
  input.onchange = async (e: any) => { const file = e.target.files?.[0]; if (file) await handleImportJSON(file) }
  input.click()
}

async function handleImportJSON(file: File) {
  importing.value = true; importResult.value = ''
  try {
    const text = await file.text(); const data = JSON.parse(text)
    if (!data.notes) { ElMessage.error('无效的数据格式'); importing.value = false; return }
    await ElMessageBox.confirm(`即将导入 ${data.notes?.length || 0} 篇笔记。`, '确认导入', { confirmButtonText: '开始导入', cancelButtonText: '取消', type: 'info' })
    try { const r = await window.api.importAllData(data); importResult.value = r.message; ElMessage.success(r.message) }
    catch { importResult.value = 'mock 导入完成'; ElMessage.success('mock 导入完成') }
    await Promise.all([noteStore.fetchNotes(), categoryStore.fetchCategories(), tagStore.fetchTags()])
  } catch (e: any) { if (e !== 'cancel' && e?.message !== 'cancel') ElMessage.error('导入失败') }
  finally { importing.value = false }
}

function triggerImportMarkdown() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.md'; input.multiple = true
  input.onchange = async (e: any) => { const fl = e.target.files as FileList; if (fl?.length) await handleImportMarkdownFiles(fl) }
  input.click()
}

async function handleImportMarkdownFiles(files: FileList) {
  importing.value = true
  try {
    await ElMessageBox.confirm(`即将导入 ${files.length} 个 Markdown 文件。`, '批量导入', { confirmButtonText: '开始导入', cancelButtonText: '取消', type: 'info' })
    const fd: { name: string; content: string }[] = []
    for (let i = 0; i < files.length; i++) { const f = files[i]; fd.push({ name: f.name, content: await f.text() }) }
    try { const r = await window.api.importMarkdownFiles(fd); importResult.value = r.message; ElMessage.success(r.message) }
    catch { for (const f of fd) await noteStore.createNote({ title: f.name.replace(/\.md$/i, '').replace(/[-_]/g, ' '), content: f.content }); importResult.value = `成功导入 ${fd.length} 个文件`; ElMessage.success(importResult.value) }
    await noteStore.fetchNotes()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error('导入失败') }
  finally { importing.value = false }
}

async function clearAllData() {
  try {
    await ElMessageBox.confirm('此操作将永久删除所有数据！', '确认清除', { confirmButtonText: '确认清除', cancelButtonText: '取消', type: 'warning', confirmButtonClass: 'el-button--danger' })
    try { await window.api.clearAllData() } catch { /* mock */ }
    ElMessage.success('所有数据已清除')
    await Promise.all([noteStore.fetchNotes(), categoryStore.fetchCategories(), tagStore.fetchTags()])
  } catch { /* cancel */ }
}

async function cleanUnusedFiles() {
  try {
    const result = await ElMessageBox.confirm(
      '此操作将扫描并删除所有未被笔记引用的图片/附件文件。操作不可撤销，建议先备份重要数据。',
      '清除未引用文件',
      { 
        confirmButtonText: '确认清除', 
        cancelButtonText: '取消', 
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
    
    if (result === 'confirm') {
      cleaningFiles.value = true
      cleanResult.value = ''
      
      try {
        const res = await window.api.cleanUnusedFiles()
        const sizeMB = (res.totalSize / (1024 * 1024)).toFixed(2)
        
        if (res.deletedCount > 0) {
          cleanResult.value = `成功清理 ${res.deletedCount} 个文件，释放 ${sizeMB} MB 空间`
          ElMessage.success(cleanResult.value)
        } else {
          cleanResult.value = '没有发现未引用的文件'
          ElMessage.info(cleanResult.value)
        }
      } catch (e: any) {
        cleanResult.value = '清理失败: ' + (e.message || '未知错误')
        ElMessage.error(cleanResult.value)
      } finally {
        cleaningFiles.value = false
      }
    }
  } catch {
    // 用户取消
  }
}

async function testSyncConnection() {
  saveSshConfig()
  syncStatus.value = 'testing'; syncMessage.value = ''
  const cfg: SftpConfig = { ...syncConfig.value, port: Number(syncConfig.value.port) || 22 }
  if (syncAuthMode.value === 'key') { cfg.password = undefined; cfg.privateKey = syncKeyContent.value }
  if (!cfg.host || !cfg.username || (!cfg.password && !cfg.privateKey)) { syncMessage.value = '请填写所有认证字段'; syncStatus.value = 'error'; return }
  try {
    const r = await window.api.testSyncConnection(cfg)
    syncStatus.value = r.ok ? 'connected' : 'error'
    syncMessage.value = r.message
  } catch {
    syncStatus.value = 'error'; syncMessage.value = 'mock: 无法连接 (浏览器模式)'
  }
}

// 验证 SSH 连接信息是否完整
function validateSshConfig(): boolean {
  const cfg = syncConfig.value
  if (!cfg.host || !cfg.host.trim()) {
    ElMessage.warning('请填写服务器地址')
    return false
  }
  if (!cfg.username || !cfg.username.trim()) {
    ElMessage.warning('请填写用户名')
    return false
  }
  if (syncAuthMode.value === 'password') {
    if (!cfg.password || !cfg.password.trim()) {
      ElMessage.warning('请填写密码')
      return false
    }
  } else if (syncAuthMode.value === 'key') {
    if (!syncKeyContent.value || !syncKeyContent.value.trim()) {
      ElMessage.warning('请粘贴 SSH 私钥内容')
      return false
    }
  }
  return true
}

function handleSaveCredentials() {
  saveSshConfig(true)
  ElMessage.success('连接信息已保存到本地')
}

async function uploadToCloud() {
  // 验证 SSH 连接信息
  if (!validateSshConfig()) return
  
  // 弹出确认对话框
  try {
    await ElMessageBox.confirm(
      '确定要将本地数据同步到云端吗？这将覆盖云端的数据库文件。',
      '同步到云端',
      {
        confirmButtonText: '确定同步',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    // 用户取消操作
    return
  }
  
  saveSshConfig()
  const cfg: SftpConfig = { ...syncConfig.value, port: Number(syncConfig.value.port) || 22 }
  if (syncAuthMode.value === 'key') { cfg.password = undefined; cfg.privateKey = syncKeyContent.value }
  syncStatus.value = 'syncing'; syncMessage.value = ''
  try {
    const r = await window.api.uploadToCloud(cfg)
    syncStatus.value = r.ok ? 'connected' : 'error'
    syncMessage.value = r.message
    syncLastSync.value = new Date().toLocaleString()
  } catch {
    syncStatus.value = 'error'; syncMessage.value = 'mock: 上传失败'
  }
}

async function downloadFromCloud() {
  // 验证 SSH 连接信息
  if (!validateSshConfig()) return
  
  // 弹出确认对话框
  try {
    await ElMessageBox.confirm(
      '确定要从云端同步数据到本地吗？这将覆盖本地的数据库文件。',
      '从云端同步',
      {
        confirmButtonText: '确定同步',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    // 用户取消操作
    return
  }
  
  saveSshConfig()
  const cfg: SftpConfig = { ...syncConfig.value, port: Number(syncConfig.value.port) || 22 }
  if (syncAuthMode.value === 'key') { cfg.password = undefined; cfg.privateKey = syncKeyContent.value }
  syncStatus.value = 'syncing'; syncMessage.value = ''
  try {
    const r = await window.api.downloadFromCloud(cfg)
    syncStatus.value = r.ok ? 'connected' : 'error'
    syncMessage.value = r.message
    if (r.ok) {
      syncLastSync.value = new Date().toLocaleString()
      await Promise.all([noteStore.fetchNotes(), categoryStore.fetchCategories(), tagStore.fetchTags()])
    }
  } catch {
    syncStatus.value = 'error'; syncMessage.value = 'mock: 下载失败'
  }
}

onMounted(() => {
  loadSshConfig()
  loadCloseBehavior()
  loadDbPath()
})

async function loadDbPath() {
  try {
    const path = await window.api.getDbPath?.()
    if (path) dbPath.value = path
  } catch {}
}

function copyDbPath() {
  if (!dbPath.value) return
  navigator.clipboard.writeText(dbPath.value).then(() => {
    ElMessage.success('数据库路径已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}
</script>

<template>
  <div class="settings-view">
    <div class="view-header"><h2>设置</h2></div>

    <el-card class="setting-card">
      <template #header><span>外观</span></template>
      <div class="setting-row"><span>深色模式</span><el-switch v-model="uiStore.isDarkMode" @change="uiStore.toggleDarkMode" /></div>
    </el-card>

    <el-card class="setting-card">
      <template #header><span>关闭行为</span></template>
      <el-radio-group v-model="closeBehavior" @change="saveCloseBehavior">
        <el-radio value="quit">直接退出</el-radio>
        <el-radio value="minimize">最小化到托盘</el-radio>
      </el-radio-group>
    </el-card>

    <el-card class="setting-card">
      <template #header><span>数据存储位置</span></template>
      <p class="desc">SQLite 数据库文件存储路径：</p>
      <div class="db-path-display">
        <el-input v-model="dbPath" readonly size="small" />
        <el-button size="small" type="primary" @click="copyDbPath">复制路径</el-button>
      </div>
    </el-card>

    <el-card class="setting-card">
      <template #header><span>完整数据迁移</span></template>
      <p class="desc">导出包含笔记、分类、标签及关联关系的完整备份文件。</p>
      <div class="setting-row">
        <span>完整备份导出</span>
        <el-button type="primary" size="default" @click="exportAllData">
          <el-icon><Download /></el-icon> 导出 JSON
        </el-button>
      </div>
      <div class="setting-row">
        <span>从备份恢复</span>
        <el-button type="success" size="default" :loading="importing" @click="triggerImportFile">
          <el-icon><Upload /></el-icon> 导入 JSON 备份
        </el-button>
      </div>
      <div class="setting-row">
        <span>导出为 Markdown</span>
        <el-button size="default" @click="exportMarkdownZip">导出 .md</el-button>
      </div>
      <div class="setting-row">
        <span>批量导入 Markdown</span>
        <el-button type="success" size="default" :loading="importing" @click="triggerImportMarkdown">
          <el-icon><Upload /></el-icon> 选择 .md 文件
        </el-button>
      </div>
      <div v-if="importResult" class="import-result" :class="{ success: !importResult.includes('失败') }">{{ importResult }}</div>
    </el-card>

    <el-card class="setting-card">
      <template #header><span>图片缓存管理</span></template>
      <p class="desc">清理笔记中未引用的图片和附件文件，释放磁盘空间。</p>
      <div class="setting-row">
        <span>清除未引用文件</span>
        <el-button type="warning" size="default" :loading="cleaningFiles" @click="cleanUnusedFiles">
          <el-icon><Delete /></el-icon> 清理缓存
        </el-button>
      </div>
      <div v-if="cleanResult" class="clean-result" :class="{ success: !cleanResult.includes('失败') }">{{ cleanResult }}</div>
    </el-card>

    <el-card class="setting-card">
      <template #header><span>云服务器同步（SSH/SFTP）</span></template>
      <p class="desc">配置 Linux 云服务器信息，同步 SQLite 数据库文件 + 笔记中引用的图片/附件。（默认不保存密码/密钥，点击“保存连接信息”后可下次自动填充）</p>
      <el-form label-position="top" size="small">
        <el-row :gutter="12">
          <el-col :span="16"><el-form-item label="服务器地址"><el-input v-model="syncConfig.host" placeholder="192.168.1.100" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="端口"><el-input v-model.number="syncConfig.port" placeholder="22" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="用户名"><el-input v-model="syncConfig.username" placeholder="root" /></el-form-item>
        <el-form-item label="远程路径"><el-input v-model="syncConfig.remotePath" placeholder="/notemaster-data" /></el-form-item>
        <el-form-item label="认证方式">
          <el-radio-group v-model="syncAuthMode">
            <el-radio value="password">密码</el-radio>
            <el-radio value="key">密钥</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="syncAuthMode === 'password'" label="密码">
          <el-input v-model="syncConfig.password" type="password" placeholder="输入密码" show-password />
        </el-form-item>
        <el-form-item v-if="syncAuthMode === 'key'" label="SSH 私钥内容">
          <el-input v-model="syncKeyContent" type="textarea" :rows="3" placeholder="粘贴 PEM 私钥内容..." />
        </el-form-item>
      </el-form>
      <div class="sync-actions">
        <el-button size="default" :loading="syncStatus === 'testing'" @click="testSyncConnection">测试连接</el-button>
        <el-button type="primary" size="default" :loading="syncStatus === 'syncing'" @click="uploadToCloud">
          <el-icon><Upload /></el-icon> 同步到云端
        </el-button>
        <el-button type="warning" size="default" :loading="syncStatus === 'syncing'" @click="downloadFromCloud">
          <el-icon><Download /></el-icon> 同步到本地
        </el-button>
        <el-button :type="isPasswordSaved ? 'success' : 'info'" size="default" @click="handleSaveCredentials">
          <el-icon v-if="!isPasswordSaved"><DocumentAdd /></el-icon>
          {{ isPasswordSaved ? '✓ 已保存' : '保存连接信息' }}
        </el-button>
        <el-button type="danger" plain size="default" @click="clearSavedCredentials" :disabled="!isPasswordSaved">
          <el-icon><Delete /></el-icon> 清除本地信息
        </el-button>
      </div>
      <div v-if="syncMessage" class="sync-status" :class="syncStatus">
        <span v-if="syncStatus === 'connected'">✅</span>
        <span v-else-if="syncStatus === 'error'">❌</span>
        <span v-else-if="syncStatus === 'testing'">⏳</span>
        <span v-else>🔄</span>
        {{ syncMessage }}
      </div>
      <div v-if="syncLastSync" class="last-sync">上次同步: {{ syncLastSync }}</div>
    </el-card>

    <el-card class="setting-card">
      <template #header><span>快捷键</span></template>
      <div class="setting-row"><span>全局搜索</span><el-tag>Ctrl+Shift+F</el-tag></div>
      <div class="setting-row"><span>新建笔记</span><el-tag>Ctrl+N</el-tag></div>
    </el-card>

    <el-card class="setting-card danger-card">
      <template #header><span class="danger-title">危险操作</span></template>
      <p class="desc">清除所有本地数据，包括笔记、分类、标签和搜索历史。操作不可撤销。</p>
      <div class="setting-row">
        <span>清除所有数据</span>
        <el-button type="danger" size="default" @click="clearAllData">清除全部</el-button>
      </div>
    </el-card>

    <el-card class="setting-card">
      <template #header><span>关于</span></template>
      <div class="about-info"><h3>NoteMaster v1.0.0</h3><p>AI驱动的个人知识管理平台</p><p>Electron + Vue3 + TypeScript</p></div>
    </el-card>
  </div>
</template>

<style scoped>
.settings-view { 
  padding: 24px; 
  height: 100%; 
  overflow: auto; 
  max-width: 900px;
  margin: 0 auto;
}
.view-header { margin-bottom: 24px; }
.view-header h2 { font-size: 20px; font-weight: 600; }
.setting-card { 
  margin-bottom: 16px;
  transition: all 0.3s ease;
}
.setting-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}
.setting-row { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.06));
}
.setting-row:last-child {
  border-bottom: none;
}
.setting-row > span:first-child {
  flex: 1;
  margin-right: 16px;
}
.setting-row .el-button, .setting-row .el-tag {
  flex-shrink: 0;
}
.desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.6; }
.import-result { margin-top: 8px; padding: 8px 12px; background: var(--bg-tertiary); border-radius: var(--radius-sm); font-size: 13px; color: var(--text-secondary); }
.import-result.success { color: #67c23a; background: rgba(103, 194, 58, 0.1); }
.clean-result { margin-top: 8px; padding: 8px 12px; background: var(--bg-tertiary); border-radius: var(--radius-sm); font-size: 13px; color: var(--text-secondary); }
.clean-result.success { color: #67c23a; background: rgba(103, 194, 58, 0.1); }
.sync-actions { 
  display: flex; 
  gap: 10px; 
  margin-top: 16px; 
  flex-wrap: nowrap;
  padding-top: 12px;
  border-top: 1px solid var(--border-color, rgba(0,0,0,0.06));
}
.sync-actions .el-button {
  min-width: 110px;
  flex: 0 0 auto;
  white-space: nowrap;
}
@media (max-width: 768px) {
  .sync-actions .el-button {
    width: 100%;
    min-width: unset;
  }
}
.sync-status { margin-top: 8px; padding: 6px 12px; border-radius: 4px; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.sync-status.connected { color: #67c23a; background: rgba(103, 194, 58, 0.08); }
.sync-status.error { color: #f56c6c; background: rgba(245, 108, 108, 0.08); }
.sync-status.testing, .sync-status.syncing { color: #409eff; background: rgba(64, 158, 255, 0.08); }
.last-sync { margin-top: 4px; font-size: 11px; color: var(--text-tertiary); }
.db-path-display { 
  display: flex; 
  gap: 10px; 
  align-items: center;
}
.db-path-display .el-input {
  flex: 1;
}
.about-info { text-align: center; padding: 16px; }
.about-info h3 { margin-bottom: 8px; color: var(--accent-color); }
.about-info p { color: var(--text-secondary); font-size: 13px; }
.danger-title { color: #f56c6c; }
.danger-card { border-color: rgba(245, 108, 108, 0.3); }
</style>
