<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCategoryStore } from '../../stores/category'
import { useNoteStore } from '../../stores/note'
import { useTagStore } from '../../stores/tag'
import { useUiStore } from '../../stores/ui'
import { useSearchStore } from '../../stores/search'
import CategoryTreeItem from './CategoryTreeItem.vue'
import ExternalFileTree from './ExternalFileTree.vue'
import type { Category } from '@shared/types'

const router = useRouter()
const route = useRoute()
const categoryStore = useCategoryStore()
const noteStore = useNoteStore()
const tagStore = useTagStore()
const uiStore = useUiStore()
const searchStore = useSearchStore()

// 分类导航状态
const currentCategoryId = ref<number | null>(null)

const archiveYears = ref<number[]>([])
const archiveMonths = ref<Map<number, number[]>>(new Map())
const expandedYear = ref<number | null>(null)
const searchKeyword = ref('')
const showAddCatInput = ref(false)
const newCatName = ref('')
const catContextMenu = ref({ visible: false, x: 0, y: 0, cat: null as Category | null })
const tagContextMenu = ref({ visible: false, x: 0, y: 0, tag: null as { id: number; name: string; color: string } | null })
const dragOverCatId = ref<number | null>(null)
const dragCatId = ref<number | null>(null)

// 外部文件相关
interface ExternalFile {
  id: number
  original_path: string
  filename: string
  size: number
  imported_at: string
  category_id: number | null
  note_id: number | null
  isImage?: boolean
}

interface DirNode {
  name: string
  path: string
  children?: DirNode[]
  files?: Array<{
    id: number
    filename: string
    path: string
    size: number
    isImage: boolean
  }>
}

const externalFiles = ref<ExternalFile[]>([])
const fileTree = ref<DirNode[]>([]) // 树形结构
const showExternalFiles = ref(true) // 默认展开
const fileTreeRef = ref<any>(null) // 树组件引用
const currentViewingPath = ref<string>('') // 当前查看的文件夹路径

// 布局调整相关
const menuHeight = ref<number>(0.35) // 顶部菜单区域占比 (0.2-0.5)
const bottomHeight = ref<number>(0.25) // 底部区域占比 (0.15-0.4)
const isResizing = ref(false)
const resizeStartY = ref(0)
const resizeStartMenuHeight = ref(0)
const resizeStartBottomHeight = ref(0)
const resizeType = ref<'menu' | 'bottom'>('menu') // 正在调整哪个分隔条

const menuItems = [
  { path: '/', name: 'home', icon: 'Document', label: '全部笔记' },
  { path: '/favorites', name: 'favorites', icon: 'Star', label: '收藏笔记' },
  { path: '/files', name: 'files', icon: 'FolderOpened', label: '文件空间' },
  { path: '/tags', name: 'tags', icon: 'CollectionTag', label: '标签管理' },
  { path: '/stats', name: 'stats', icon: 'DataAnalysis', label: '数据统计' },
  { path: '/trash', name: 'trash', icon: 'Delete', label: '回收站' },
  { path: '/settings', name: 'settings', icon: 'Setting', label: '设置' }
]

function navigate(path: string) {
  router.push(path)
  noteStore.clearFilters()
}

function selectCategory(catId: number | null) {
  currentCategoryId.value = catId
  categoryStore.selectCategory(catId)
  noteStore.setFilters({ category_id: catId })
  router.push('/')
}

function selectTag(tagId: number) {
  // 如果当前已经选中的是这个标签，则取消选中
  if (noteStore.filters.tag_id === tagId) {
    // 取消选中：直接设置空的 filters
    noteStore.clearFilters()
  } else {
    // 选中新标签
    noteStore.setFilters({ tag_id: tagId })
  }
  router.push('/')
}

function selectNoTag() {
  // 如果当前已经是无标签筛选状态，则取消
  if (noteStore.filters.tag_id === 0) {
    noteStore.clearFilters()
  } else {
    // 使用特殊值 0 表示筛选无标签的笔记
    noteStore.setFilters({ tag_id: 0 })
  }
  router.push('/')
}

function selectArchive(year: number, month?: number) {
  noteStore.setFilters({ year, month })
  router.push('/')
}

function handleQuickSearch() {
  if (searchKeyword.value.trim()) {
    router.push('/search')
    searchStore.search(searchKeyword.value.trim())
  }
}

async function loadArchiveYears() {
  try { archiveYears.value = await window.api.getArchiveYears() } catch { archiveYears.value = [2026, 2025, 2024] }
}

async function toggleYear(year: number) {
  if (expandedYear.value === year) {
    expandedYear.value = null
  } else {
    expandedYear.value = year
    try {
      const months = await window.api.getArchiveMonths(year)
      archiveMonths.value.set(year, months)
    } catch { archiveMonths.value.set(year, [6, 5, 4]) }
  }
}

async function handleAddRootCategory() {
  const name = newCatName.value.trim()
  if (!name) return
  try { await window.api.createCategory({ name }) } catch { /* mock */ }
  showAddCatInput.value = false
  newCatName.value = ''
  await categoryStore.fetchCategories()
  ElMessage.success('分类已创建')
}

function handleCatContextMenu(event: MouseEvent, cat: Category) {
  event.preventDefault()
  event.stopPropagation()
  catContextMenu.value = { visible: true, x: event.clientX, y: event.clientY, cat }
  setTimeout(() => { document.addEventListener('click', closeCatMenu, { once: true }) }, 0)
}

function closeCatMenu() {
  catContextMenu.value.visible = false
}

async function catMenuNewSub() {
  const cat = catContextMenu.value.cat
  if (!cat) return
  closeCatMenu()
  try {
    const { value } = await ElMessageBox.prompt('子文件夹名称', '新建子文件夹', { confirmButtonText: '创建', cancelButtonText: '取消' })
    if (value?.trim()) {
      try { await window.api.createSubCategory(cat.id, value.trim()) } catch { /* mock */ }
      await categoryStore.fetchCategories()
      ElMessage.success('子文件夹已创建')
    }
  } catch { /* cancel */ }
}

async function catMenuRename() {
  const cat = catContextMenu.value.cat
  if (!cat) return
  closeCatMenu()
  try {
    const { value } = await ElMessageBox.prompt('新的分类名称', '重命名', { confirmButtonText: '确定', cancelButtonText: '取消', inputValue: cat.name })
    if (value?.trim()) {
      try { await window.api.renameCategory(cat.id, value.trim()) } catch { /* mock */ }
      await categoryStore.fetchCategories()
      ElMessage.success('已重命名')
    }
  } catch { /* cancel */ }
}

async function catMenuToggleFavorite() {
  const cat = catContextMenu.value.cat
  if (!cat) return
  closeCatMenu()
  try { await window.api.toggleCategoryFavorite(cat.id) } catch { /* mock */ }
  await categoryStore.fetchCategories()
  await categoryStore.fetchFavorites()
}

async function catMenuExport() {
  const cat = catContextMenu.value.cat
  if (!cat) return
  closeCatMenu()
  
  console.log('[Export] Starting export for category:', cat.name, 'id:', cat.id)
  
  try {
    // 显示确认对话框
    await ElMessageBox.confirm(
      `将导出分类「${cat.name}」及其所有笔记和图片到 ZIP 压缩包中。`,
      '导出分类',
      {
        confirmButtonText: '开始导出',
        cancelButtonText: '取消',
        type: 'info'
      }
    )
    
    // 显示进度对话框
    let progressMsg: any = null
    
    const handleProgress = (data: { current: number; total: number; status: string }) => {
      console.log('[Export] Progress:', data)
      if (!progressMsg) {
        progressMsg = ElMessage({
          message: `正在导出 ${cat.name}...`,
          type: 'info',
          duration: 0
        })
      }
      if (data.status === 'complete') {
        progressMsg.close()
        cleanup()
      } else {
        progressMsg.message = `正在导出 ${cat.name}... (${data.current}/${data.total})`
      }
    }
    
    const cleanup = window.api.onExportProgress(handleProgress)
    
    try {
      console.log('[Export] Calling exportCategoryFolder API...')
      const result = await window.api.exportCategoryFolder(cat.id)
      console.log('[Export Folder] API result:', JSON.stringify(result, null, 2))
      
      if (result && result.notes && result.notes.length > 0) {
        console.log('[Export Folder] Notes count:', result.notes.length, 'Images count:', result.images?.length || 0)
        await exportAsFolder(result.title, result.notes, result.images || [])
      } else {
        console.error('[Export Folder] No notes in result:', result)
        const noteCount = result?.notes?.length || 0
        ElMessage.warning(`该分类下没有找到笔记（共 ${noteCount} 篇）`)
      }
    } finally {
      cleanup()
    }
  } catch (error) {
    console.error('[Export] Error:', error)
    if (error !== 'cancel') {
      ElMessage.error('导出失败：' + (error as Error).message)
    }
  }
}

async function exportAsZipWithFolders(folderName: string, notes: Array<{ filename: string; content: string; categoryPath?: string }>) {
  console.log('[Export ZIP] Starting ZIP export, notes count:', notes.length)
  
  try {
    // 尝试从本地导入 JSZip
    let JSZip: any
    
    try {
      console.log('[Export ZIP] Trying to import JSZip from local...')
      const jszipModule = await import('jszip')
      JSZip = jszipModule.default || jszipModule
      console.log('[Export ZIP] JSZip loaded from local')
    } catch (importError) {
      console.warn('[Export ZIP] Local import failed, trying CDN...', importError)
      // 降级方案：从 CDN 加载
      if (!(window as any).JSZip) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
          script.onload = () => {
            console.log('[Export ZIP] JSZip loaded from CDN')
            resolve(true)
          }
          script.onerror = (err) => {
            console.error('[Export ZIP] CDN load failed', err)
            reject(err)
          }
          document.head.appendChild(script)
        })
      }
      JSZip = (window as any).JSZip
    }
    
    if (!JSZip) {
      throw new Error('JSZip 加载失败')
    }
    
    const zip = new JSZip()
    console.log('[Export ZIP] Creating ZIP archive...')
    
    // 将所有笔记添加到 ZIP，按分类路径组织文件夹结构
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]
      // 如果有分类路径，创建子文件夹
      let filePath = note.filename
      if (note.categoryPath) {
        filePath = `${note.categoryPath}/${note.filename}`
      }
      zip.file(filePath, note.content)
      console.log(`[Export ZIP] Added file ${i + 1}/${notes.length}:`, filePath)
    }
    
    console.log('[Export ZIP] Generating ZIP blob...')
    // 生成 ZIP 文件
    const blob = await zip.generateAsync({ type: 'blob' })
    console.log('[Export ZIP] ZIP blob generated, size:', blob.size, 'bytes')
    
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${folderName}-${notes.length}篇笔记.zip`
    console.log('[Export ZIP] Triggering download:', a.download)
    a.click()
    URL.revokeObjectURL(url)
    
    ElMessage.success(`已导出 ZIP 压缩包：${folderName}（${notes.length} 篇笔记）`)
    console.log('[Export ZIP] Export completed successfully')
  } catch (error) {
    console.error('[Export ZIP] Error:', error)
    ElMessage.error('导出 ZIP 失败：' + (error as Error).message)
  }
}

// 导出为文件夹（包含图片）
async function exportAsFolder(
  folderName: string,
  notes: Array<{ filename: string; content: string; categoryPath?: string }>,
  images: Array<{ filename: string; base64: string; path: string }>
) {
  console.log('[Export Folder] Starting folder export, notes count:', notes.length, 'images count:', images.length)
  
  try {
    // 尝试从本地导入 JSZip
    let JSZip: any
    
    try {
      console.log('[Export Folder] Trying to import JSZip from local...')
      const jszipModule = await import('jszip')
      JSZip = jszipModule.default || jszipModule
      console.log('[Export Folder] JSZip loaded from local')
    } catch (importError) {
      console.warn('[Export Folder] Local import failed, trying CDN...', importError)
      // 降级方案：从 CDN 加载
      if (!(window as any).JSZip) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
          script.onload = () => {
            console.log('[Export Folder] JSZip loaded from CDN')
            resolve(true)
          }
          script.onerror = (err) => {
            console.error('[Export Folder] CDN load failed', err)
            reject(err)
          }
          document.head.appendChild(script)
        })
      }
      JSZip = (window as any).JSZip
    }
    
    if (!JSZip) {
      throw new Error('JSZip 加载失败')
    }
    
    const zip = new JSZip()
    console.log('[Export Folder] Creating ZIP archive with folder structure...')
    
    // 不创建根文件夹,直接将MD和图片放在ZIP根目录
    
    // 添加所有笔记文件，按分类路径组织
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]
      let filePath = note.filename
      if (note.categoryPath) {
        filePath = `${note.categoryPath}/${note.filename}`
      }
      zip.file(filePath, note.content)
      console.log(`[Export Folder] Added note ${i + 1}/${notes.length}:`, filePath)
    }
    
    // 添加图片文件夹和图片文件(在ZIP根目录)
    if (images.length > 0) {
      const imagesFolder = zip.folder('images')
      if (!imagesFolder) throw new Error('创建图片文件夹失败')
      
      for (let i = 0; i < images.length; i++) {
        const image = images[i]
        try {
          // 将 Base64 转换为 Blob
          const binaryString = atob(image.base64)
          const bytes = new Uint8Array(binaryString.length)
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j)
          }
          const blob = new Blob([bytes])
          
          imagesFolder.file(image.filename, blob)
          console.log(`[Export Folder] Added image ${i + 1}/${images.length}:`, image.filename)
        } catch (error) {
          console.error(`[Export Folder] Failed to add image ${image.filename}:`, error)
        }
      }
    }
    
    console.log('[Export Folder] Generating ZIP blob...')
    // 生成 ZIP 文件
    const blob = await zip.generateAsync({ type: 'blob' })
    console.log('[Export Folder] ZIP blob generated, size:', blob.size, 'bytes')
    
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${folderName}-${notes.length}篇笔记.zip`
    console.log('[Export Folder] Triggering download:', a.download)
    a.click()
    URL.revokeObjectURL(url)
    
    ElMessage.success(`已导出文件夹：${folderName}（${notes.length} 篇笔记，${images.length} 张图片）`)
    console.log('[Export Folder] Export completed successfully')
  } catch (error) {
    console.error('[Export Folder] Error:', error)
    ElMessage.error('导出文件夹失败：' + (error as Error).message)
  }
}

async function catMenuDelete() {
  const cat = catContextMenu.value.cat
  if (!cat) return
  closeCatMenu()
  try {
    await ElMessageBox.confirm(`确定删除分类「${cat.name}」？其下的笔记将变为未分类。`, '删除分类', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    try { await window.api.deleteCategory(cat.id) } catch { /* mock */ }
    await categoryStore.fetchCategories()
    if (categoryStore.selectedCategoryId === cat.id) categoryStore.selectCategory(null)
    ElMessage.success('分类已删除')
  } catch { /* cancel */ }
}

function handleTagContextMenu(event: MouseEvent, tag: { id: number; name: string; color: string }) {
  event.preventDefault()
  event.stopPropagation()
  
  // 计算菜单位置，避免超出窗口边界
  const menuHeight = 160 // 预估菜单高度
  const menuWidth = 160  // 预估菜单宽度
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth
  
  let x = event.clientX
  let y = event.clientY
  
  // 如果菜单会超出底部，向上显示
  if (y + menuHeight > viewportHeight) {
    y = Math.max(0, viewportHeight - menuHeight)
  }
  
  // 如果菜单会超出右侧，向左显示
  if (x + menuWidth > viewportWidth) {
    x = Math.max(0, viewportWidth - menuWidth)
  }
  
  tagContextMenu.value = { visible: true, x, y, tag }
  setTimeout(() => { document.addEventListener('click', closeTagMenu, { once: true }) }, 0)
}

function closeTagMenu() {
  tagContextMenu.value.visible = false
}

async function tagMenuRename() {
  const tag = tagContextMenu.value.tag
  if (!tag) return
  closeTagMenu()
  try {
    const { value } = await ElMessageBox.prompt('新的标签名称', '重命名标签', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: tag.name
    })
    if (value?.trim()) {
      await tagStore.updateTag(tag.id, { name: value.trim() })
      ElMessage.success('标签已重命名')
    }
  } catch { /* cancel */ }
}

async function tagMenuChangeColor() {
  const tag = tagContextMenu.value.tag
  if (!tag) return
  closeTagMenu()
  
  const colors = [
    { name: '蓝色', value: '#409EFF' },
    { name: '绿色', value: '#67C23A' },
    { name: '橙色', value: '#E6A23C' },
    { name: '红色', value: '#F56C6C' },
    { name: '灰色', value: '#909399' },
    { name: '紫色', value: '#B37FEB' },
    { name: '粉色', value: '#FF6B9D' },
    { name: '青色', value: '#36CFC9' }
  ]
  
  // 创建颜色选择弹窗 HTML
  let selectedValue = tag.color
  const colorHtml = colors.map(c => `
    <div class="color-option" data-value="${c.value}" style="
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      margin: 4px;
      border: 2px solid ${c.value === tag.color ? c.value : 'transparent'};
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    " onclick="(function() {
      document.querySelectorAll('.color-option').forEach(el => el.style.borderColor = 'transparent');
      this.style.borderColor = '${c.value}';
      window.__selectedColor = '${c.value}';
    }).call(this)">
      <span style="width: 20px; height: 20px; border-radius: 50%; background: ${c.value};"></span>
      <span style="font-size: 13px; color: #303133;">${c.name}</span>
    </div>
  `).join('')
  
  try {
    await ElMessageBox({
      title: '选择标签颜色',
      message: `<div style="display: flex; flex-wrap: wrap; justify-content: center;">${colorHtml}</div>`,
      dangerouslyUseHTMLString: true,
      showCancelButton: true,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    
    // 获取选中的颜色
    const newColor = (window as any).__selectedColor || tag.color
    if (newColor !== tag.color) {
      await tagStore.updateTag(tag.id, { color: newColor })
      ElMessage.success('颜色已更换')
    }
  } catch {
    // 用户取消
  }
}

async function tagMenuDelete() {
  const tag = tagContextMenu.value.tag
  if (!tag) return
  closeTagMenu()
  try {
    await ElMessageBox.confirm(
      `确定删除标签「${tag.name}」？删除后所有关联笔记将取消此标签。`,
      '删除标签',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await tagStore.deleteTag(tag.id)
    // 如果当前选中的是被删除的标签，取消筛选
    if (noteStore.filters.tag_id === tag.id) {
      noteStore.clearFilters()
    }
    ElMessage.success('标签已删除')
  } catch { /* cancel */ }
}

function onDragOverCat(event: DragEvent, catId: number) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOverCatId.value = catId
}

function onDragLeaveCat() {
  dragOverCatId.value = null
}

function onCatDragStart(event: DragEvent, cat: Category) {
  event.dataTransfer!.setData('category/id', String(cat.id))
  event.dataTransfer!.effectAllowed = 'move'
  dragCatId.value = cat.id
}

async function onDropToCat(event: DragEvent, catId: number) {
  event.preventDefault()
  dragOverCatId.value = null

  const catIdStr = event.dataTransfer?.getData('category/id')
  if (catIdStr) {
    const draggedCatId = parseInt(catIdStr)
    if (draggedCatId && draggedCatId !== catId) {
      try {
        await window.api.moveCategory(draggedCatId, catId)
      } catch { /* mock */ }
      await categoryStore.fetchCategories()
      await categoryStore.fetchFavorites()
      ElMessage.success('分类已移动')
    }
    dragCatId.value = null
    return
  }

  const noteIdStr = event.dataTransfer?.getData('text/note-id')
  if (!noteIdStr) return
  const noteId = parseInt(noteIdStr)
  if (!noteId) return
  try {
    await window.api.moveNoteToCategory(noteId, catId)
    await noteStore.fetchNotes()
    ElMessage.success('笔记已移动到该分类')
  } catch {
    try {
      const note = noteStore.notes.find(n => n.id === noteId)
      if (note) {
        note.category_id = catId
        note.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
        await noteStore.fetchNotes()
        ElMessage.success('笔记已移动到该分类')
      } else {
        ElMessage.error('移动失败')
      }
    } catch {
      ElMessage.error('移动失败')
    }
  }
}

onMounted(async () => {
  loadArchiveYears()
  categoryStore.fetchFavorites()
  
  // 加载保存的当前查看路径
  try {
    const result = await window.api.getCurrentViewingPath()
    console.log('[onMounted] Current viewing path:', result)
    if (result.success && result.path) {
      currentViewingPath.value = result.path
      console.log('[onMounted] Set currentViewingPath to:', result.path)
    }
  } catch (error) {
    console.error('加载当前查看路径失败:', error)
  }
  
  loadExternalFiles()
  loadLayout() // 加载保存的布局
  // 监听外部文件变更事件
  window.addEventListener('external-files-changed', loadExternalFiles)
})

onUnmounted(() => {
  window.removeEventListener('external-files-changed', loadExternalFiles)
})

// 加载外部文件列表
async function loadExternalFiles() {
  try {
    // 每次都从后端获取最新的当前查看路径，确保与数据库同步
    const pathResult = await window.api.getCurrentViewingPath()
    if (!pathResult.success || !pathResult.path) {
      console.log('[loadExternalFiles] No viewing path, clearing data')
      fileTree.value = []
      externalFiles.value = []
      return
    }
    
    const currentPath = pathResult.path
    console.log('[loadExternalFiles] currentViewingPath:', currentPath)
    
    // 使用新的 API 获取树形结构，传入当前查看的路径
    console.log('[loadExternalFiles] Scanning path:', currentPath)
    const result = await window.api.scanExternalDirs(currentPath)
    console.log('[loadExternalFiles] Result:', result)
    
    if (result.success && result.tree) {
      fileTree.value = result.tree
      console.log('[loadExternalFiles] Tree loaded:', result.tree.length, 'nodes')
      
      // 同时更新 externalFiles 用于兼容旧代码
      function collectFiles(nodes: DirNode[]): ExternalFile[] {
        const files: ExternalFile[] = []
        for (const node of nodes) {
          if (node.files) {
            files.push(...node.files.map(f => ({
              id: f.id,
              original_path: f.path,
              filename: f.filename,
              size: f.size,
              imported_at: new Date().toISOString(),
              category_id: null,
              note_id: null,
              isImage: f.isImage
            })))
          }
          if (node.children && node.children.length > 0) {
            files.push(...collectFiles(node.children))
          }
        }
        return files
      }
      
      externalFiles.value = collectFiles(result.tree)
      console.log('[loadExternalFiles] Files collected:', externalFiles.value.length)
    } else {
      ElMessage.error(`加载失败: ${result.error}`)
    }
  } catch (error) {
    console.error('加载外部文件失败:', error)
    ElMessage.error('加载外部文件失败')
  }
}

// 设置当前查看的文件夹
function setCurrentViewingPath(path: string) {
  console.log('[setCurrentViewingPath] Setting path:', path)
  currentViewingPath.value = path
  loadExternalFiles()
}

// 【调试】查看所有外部文件记录
async function debugExternalFiles() {
  try {
    const result = await window.api.debugAllFiles()
    console.log('[debugExternalFiles] Result:', result)
    if (result.success && result.files) {
      ElMessage.info(`数据库中共有 ${result.files.length} 个外部文件`)
      if (result.files.length > 0) {
        console.table(result.files.slice(0, 10)) // 只显示前10条
      }
    } else {
      ElMessage.error('查询失败')
    }
  } catch (error) {
    console.error('调试查询失败:', error)
    ElMessage.error('查询失败')
  }
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

// 删除外部文件记录
async function deleteExternalFileRecord(id: number) {
  try {
    await ElMessageBox.confirm(
      '确定要删除这条外部文件记录吗？（不会删除实际文件）',
      '删除记录',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const result = await window.api.deleteExternalFile(id)
    if (result.success) {
      ElMessage.success('记录已删除')
      await loadExternalFiles()
    } else {
      ElMessage.error('删除失败')
    }
  } catch (error) {
    // 用户取消
  }
}

// 用系统默认程序打开外部文件
async function openExternalFile(filePath: string) {
  try {
    const result = await window.api.openExternalFile(filePath)
    if (!result.success) {
      ElMessage.error(`打开失败: ${result.error}`)
    }
  } catch (error) {
    console.error('打开外部文件失败:', error)
    ElMessage.error('打开外部文件失败')
  }
}

// 开始调整顶部菜单区域高度
function startResizeMenu(event: MouseEvent) {
  event.preventDefault()
  isResizing.value = true
  resizeType.value = 'menu'
  resizeStartY.value = event.clientY
  resizeStartMenuHeight.value = menuHeight.value
  
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
}

// 开始调整底部区域高度
function startResizeBottom(event: MouseEvent) {
  event.preventDefault()
  isResizing.value = true
  resizeType.value = 'bottom'
  resizeStartY.value = event.clientY
  resizeStartBottomHeight.value = bottomHeight.value
  
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
}

// 处理拖拽调整
function handleResize(event: MouseEvent) {
  if (!isResizing.value) return
  
  const sidebarElement = document.querySelector('.sidebar') as HTMLElement
  if (!sidebarElement) return
  
  const sidebarHeight = sidebarElement.clientHeight
  const deltaY = event.clientY - resizeStartY.value
  const deltaRatio = deltaY / sidebarHeight
  
  if (resizeType.value === 'menu') {
    // 调整顶部菜单区域
    const newMenuHeight = resizeStartMenuHeight.value + deltaRatio
    menuHeight.value = Math.max(0.2, Math.min(0.5, newMenuHeight))
  } else {
    // 调整底部区域（外部文件）
    const newBottomHeight = resizeStartBottomHeight.value - deltaRatio
    bottomHeight.value = Math.max(0.15, Math.min(0.4, newBottomHeight))
  }
}

// 停止调整
function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  
  // 保存布局到 localStorage
  saveLayout()
}

// 保存布局
function saveLayout() {
  try {
    localStorage.setItem('sidebar-menu-height', String(menuHeight.value))
    localStorage.setItem('sidebar-bottom-height', String(bottomHeight.value))
  } catch (error) {
    console.error('保存布局失败:', error)
  }
}

// 加载布局
function loadLayout() {
  try {
    const savedMenuHeight = localStorage.getItem('sidebar-menu-height')
    const savedBottomHeight = localStorage.getItem('sidebar-bottom-height')
    
    if (savedMenuHeight) {
      menuHeight.value = parseFloat(savedMenuHeight)
    }
    if (savedBottomHeight) {
      bottomHeight.value = parseFloat(savedBottomHeight)
    }
  } catch (error) {
    console.error('加载布局失败:', error)
  }
}

// 预览外部文件（在右侧内容栏显示）
function previewExternalFile(file: {
  id: number
  original_path: string
  filename: string
  size: number
  imported_at: string
}) {
  console.log('[AppSidebar] Preview external file:', file)
  router.push({
    path: '/external-preview',
    query: {
      path: file.original_path,
      name: file.filename
    }
  })
}

// 处理外部文件拖拽开始
function handleExternalFileDragStart(event: DragEvent, file: ExternalFile) {
  // 设置拖拽数据
  event.dataTransfer?.setData('text/plain', file.original_path)
  event.dataTransfer!.effectAllowed = 'copy'
}

// 全部展开/收起（调用树组件的方法）
function expandAllDirs() {
  fileTreeRef.value?.expandAll()
}

function collapseAllDirs() {
  fileTreeRef.value?.collapseAll()
}

const isActive = (path: string) => route.path === path
</script>

<template>
  <div class="sidebar">
    <!-- 顶部固定区域 -->
    <div class="sidebar-top-fixed" :style="{ height: menuHeight * 100 + '%' }">
      <el-scrollbar class="sidebar-top-scroll">
        <div class="sidebar-header">
          <h2 class="app-title">AmNote</h2>
          <el-button :icon="uiStore.isDarkMode ? 'Sunny' : 'Moon'" circle size="small" @click="uiStore.toggleDarkMode()" />
        </div>

        <div class="sidebar-search">
          <el-input v-model="searchKeyword" placeholder="搜索..." size="small" clearable @keyup.enter="handleQuickSearch" @click="uiStore.openSearchDialog()">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>

        <!-- 固定菜单项 -->
        <div class="fixed-menu">
          <div v-for="item in menuItems" :key="item.path"
            class="menu-item" :class="{ active: isActive(item.path) }"
            @click="navigate(item.path)">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <!-- 顶部菜单和中间区域的分隔条 -->
    <div 
      class="resize-handle resize-handle-top"
      :class="{ 'resizing': isResizing && resizeType === 'menu' }"
      @mousedown="startResizeMenu"
      title="拖动调整顶部菜单区域高度"
    >
      <div class="resize-handle-bar"></div>
    </div>

    <!-- 中间可滚动区域（不包含外部文件） -->
    <el-scrollbar class="sidebar-scroll-content">

      <div v-if="categoryStore.favoriteCategories.length > 0" class="sidebar-section">
        <div class="section-title">⭐ 收藏的分类</div>
        <CategoryTreeItem
          v-for="fav in categoryStore.favoriteCategories"
          :key="fav.id"
          :category="fav"
          :depth="0"
          :selected-category-id="categoryStore.selectedCategoryId"
          :drag-over-cat-id="dragOverCatId"
          @select-category="selectCategory"
          @context-menu="(evt: MouseEvent, cat: Category) => handleCatContextMenu(evt, cat)"
          @cat-drag-start="(evt: DragEvent, cat: Category) => onCatDragStart(evt, cat)"
          @cat-drag-over="(evt: DragEvent, catId: number) => onDragOverCat(evt, catId)"
          @cat-drag-leave="onDragLeaveCat"
          @cat-drop="(evt: DragEvent, catId: number) => onDropToCat(evt, catId)"
        />
      </div>

      <div class="sidebar-section">
        <div class="section-header">
          <span class="section-title">分类</span>
          <el-button size="small" text :icon="'Plus'" @click="showAddCatInput = true" title="新建分类" />
        </div>
        <div v-if="showAddCatInput" class="add-cat-row">
          <el-input v-model="newCatName" size="small" placeholder="分类名称..." @keyup.enter="handleAddRootCategory" ref="addCatInputRef" />
          <el-button size="small" type="primary" @click="handleAddRootCategory">确定</el-button>
          <el-button size="small" @click="showAddCatInput = false">取消</el-button>
        </div>
        <CategoryTreeItem
          v-for="cat in categoryStore.categories"
          :key="cat.id"
          :category="cat"
          :depth="0"
          :selected-category-id="categoryStore.selectedCategoryId"
          :drag-over-cat-id="dragOverCatId"
          @select-category="selectCategory"
          @context-menu="(evt: MouseEvent, cat: Category) => handleCatContextMenu(evt, cat)"
          @cat-drag-start="(evt: DragEvent, cat: Category) => onCatDragStart(evt, cat)"
          @cat-drag-over="(evt: DragEvent, catId: number) => onDragOverCat(evt, catId)"
          @cat-drag-leave="onDragLeaveCat"
          @cat-drop="(evt: DragEvent, catId: number) => onDropToCat(evt, catId)"
        />
        <div class="menu-item" :class="{ active: categoryStore.selectedCategoryId === null && route.path === '/' }" @click="selectCategory(null)">
          <el-icon><FolderAdd /></el-icon>
          <span>未分类</span>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="section-title">日期归档</div>
        <div v-for="year in archiveYears" :key="year">
          <div class="menu-item" @click="toggleYear(year)">
            <el-icon><component :is="expandedYear === year ? 'ArrowDown' : 'ArrowRight'" /></el-icon>
            <span>{{ year }}年</span>
          </div>
          <div v-if="expandedYear === year" v-for="month in archiveMonths.get(year)" :key="month"
            class="menu-item sub-item" @click="selectArchive(year, month)">
            <el-icon><Calendar /></el-icon>
            <span>{{ year }}-{{ String(month).padStart(2, '0') }}</span>
          </div>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="section-title">标签</div>
        <div 
          class="menu-item tag-item" 
          :class="{ active: noteStore.filters.tag_id === 0 }"
          @click="selectNoTag()">
          <span class="tag-dot" style="background: #909399;"></span>
          <span># 无标签</span>
        </div>
        <div v-for="tag in tagStore.tags" :key="tag.id"
          class="menu-item tag-item"
          :class="{ active: noteStore.filters.tag_id === tag.id }"
          @click="selectTag(tag.id)"
          @contextmenu="handleTagContextMenu($event, tag)">
          <span class="tag-dot" :style="{ background: tag.color }"></span>
          <span># {{ tag.name }}</span>
        </div>
      </div>
    </el-scrollbar>

    <!-- 中间和底部区域的分隔条 -->
    <div 
      class="resize-handle resize-handle-bottom"
      :class="{ 'resizing': isResizing && resizeType === 'bottom' }"
      @mousedown="startResizeBottom"
      title="拖动调整底部区域高度"
    >
      <div class="resize-handle-bar"></div>
    </div>

    <!-- 底部固定外部区域（占1/4） -->
    <div class="sidebar-bottom-fixed" :style="{ height: bottomHeight * 100 + '%' }">
      <div class="external-files-section">
        <div class="section-header" @click="showExternalFiles = !showExternalFiles">
          <el-icon><component :is="showExternalFiles ? 'ArrowDown' : 'ArrowRight'" /></el-icon>
          <span class="section-title">外部文件 ({{ externalFiles.length }})</span>
          <div v-if="showExternalFiles && fileTree.length > 0" class="header-actions">
            <el-button size="small" text @click.stop="expandAllDirs" title="全部展开">
              <el-icon><ArrowDown /></el-icon>
            </el-button>
            <el-button size="small" text @click.stop="collapseAllDirs" title="全部收起">
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
          <!-- 调试按钮 -->
          <el-button 
            v-if="showExternalFiles" 
            size="small" 
            text 
            @click.stop="debugExternalFiles" 
            title="调试：查看数据库中的文件"
            style="margin-left: auto; color: #f56c6c;">
            🔍
          </el-button>
        </div>
        
        <el-scrollbar v-if="showExternalFiles" class="external-files-list">
          <!-- 使用树形组件显示 -->
          <ExternalFileTree
            ref="fileTreeRef"
            :tree="fileTree"
            @preview="previewExternalFile"
            @open="openExternalFile"
            @delete="deleteExternalFileRecord"
            @dragstart="handleExternalFileDragStart"
          />
          
          <div v-if="fileTree.length === 0" class="empty-external-files">
            <el-empty description="暂无外部文件" :image-size="60" />
          </div>
        </el-scrollbar>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="catContextMenu.visible" class="context-menu-overlay" :style="{ left: catContextMenu.x + 'px', top: catContextMenu.y + 'px' }" @click.stop>
        <div class="context-menu-item" @click="catMenuNewSub">
          <el-icon><FolderAdd /></el-icon> 新建子文件夹
        </div>
        <div class="context-menu-item" @click="catMenuRename">
          <el-icon><Edit /></el-icon> 重命名
        </div>
        <div class="context-menu-item" @click="catMenuToggleFavorite">
          <el-icon><Star /></el-icon> {{ catContextMenu.cat?.is_favorite ? '取消收藏' : '收藏文件夹' }}
        </div>
        <div class="context-menu-item" @click="catMenuExport">
          <el-icon><Download /></el-icon> 导出
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" @click="catMenuDelete">
          <el-icon><Delete /></el-icon> 删除
        </div>
      </div>

      <div v-if="tagContextMenu.visible" class="context-menu-overlay" :style="{ left: tagContextMenu.x + 'px', top: tagContextMenu.y + 'px' }" @click.stop>
        <div class="context-menu-item" @click="tagMenuRename">
          <el-icon><Edit /></el-icon> 重命名
        </div>
        <div class="context-menu-item" @click="tagMenuChangeColor">
          <el-icon><Brush /></el-icon> 更换颜色
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" @click="tagMenuDelete">
          <el-icon><Delete /></el-icon> 删除
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sidebar { 
  height: 100%; 
  display: flex; 
  flex-direction: column;
}

/* 顶部固定区域 */
.sidebar-top-fixed {
  flex-shrink: 0;
  /* 边框由分隔条提供 */
}

/* 顶部滚动容器 */
.sidebar-top-scroll {
  height: 100%;
  overflow-y: auto;
}

/* 自定义滚动条样式 */
.sidebar-top-scroll :deep(.el-scrollbar__bar) {
  opacity: 0.3;
  transition: opacity 0.3s;
}
.sidebar-top-scroll:hover :deep(.el-scrollbar__bar) {
  opacity: 1;
}

.sidebar-header { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  padding: 16px; 
}
.app-title { 
  font-size: 18px; 
  font-weight: 700; 
  color: var(--accent-color); 
  letter-spacing: 0.5px; 
}
.sidebar-search { 
  padding: 8px 12px; 
}

/* 固定菜单 */
.fixed-menu {
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color);
}

/* 中间可滚动区域 */
.sidebar-scroll-content {
  flex: 1; /* 自动填充剩余空间 */
  min-height: 0;
  overflow: hidden;
}

/* 底部固定外部文件区域 */
.sidebar-bottom-fixed {
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 边框由分隔条提供 */
}

.sidebar-bottom-fixed .external-files-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.menu-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 6px; cursor: pointer; color: var(--text-secondary); transition: all 0.15s ease; font-size: 13px; }
.menu-item:hover { background: var(--hover-bg); color: var(--text-primary); }
.menu-item.active { 
  background: var(--active-bg); 
  color: var(--accent-color); 
  font-weight: 500;
}
.menu-item.tag-item.active {
  background: rgba(0, 120, 212, 0.1);
  border-left: 3px solid var(--accent-color);
  padding-left: 9px;
}
.menu-item.drag-over { background: rgba(0, 120, 212, 0.1); outline: 2px dashed var(--accent-color); outline-offset: -2px; }
.menu-item[draggable="true"] { cursor: grab; }
.menu-item[draggable="true"]:active { cursor: grabbing; }
.section-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 12px 8px; }
.section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-tertiary); letter-spacing: 0.5px; }
.add-cat-row { display: flex; gap: 4px; padding: 4px 12px 8px; align-items: center; }

/* 拖拽分隔条样式 */
.resize-handle {
  height: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
  transition: background 0.2s;
  position: relative;
  z-index: 10;
}
.resize-handle:hover {
  background: rgba(0, 120, 212, 0.1);
}
.resize-handle.resizing {
  background: rgba(0, 120, 212, 0.2);
}
.resize-handle-bar {
  width: 40px;
  height: 3px;
  border-radius: 2px;
  background: var(--border-color);
  transition: background 0.2s;
}
.resize-handle:hover .resize-handle-bar {
  background: var(--accent-color);
}
.resize-handle.resizing .resize-handle-bar {
  background: var(--accent-color);
}

.add-cat-row .el-input { flex: 1; }
.tag-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.tag-item { font-size: 12px; }

/* 外部文件区域样式 */
.sidebar-bottom-fixed .external-files-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-bottom-fixed .section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 8px 12px;
  user-select: none;
  flex-shrink: 0;
}
.sidebar-bottom-fixed .section-header:hover {
  background: var(--hover-bg);
}
.sidebar-bottom-fixed .header-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
.sidebar-bottom-fixed .external-files-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 8px;
}

/* 文件夹分组样式 */
.file-group {
  margin-bottom: 8px;
}
.dir-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}
.dir-header:hover {
  background: var(--hover-bg);
}
.dir-header .expand-icon {
  font-size: 12px;
  color: var(--text-tertiary);
  width: 16px;
  flex-shrink: 0;
}
.dir-header .folder-icon {
  font-size: 16px;
  color: #f5a623;
  flex-shrink: 0;
}
.dir-header .dir-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dir-files {
  padding-left: 24px;
}
.external-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}
.external-file-item[draggable="true"] {
  cursor: grab;
}
.external-file-item[draggable="true"]:active {
  cursor: grabbing;
}
.external-file-item:hover {
  background: var(--hover-bg);
}
.external-file-item .file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.external-file-item .file-icon {
  font-size: 16px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.external-file-item .file-details {
  flex: 1;
  min-width: 0;
}
.external-file-item .file-name {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.external-file-item .file-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.external-file-item .file-date {
  opacity: 0.7;
}
.empty-external-files {
  padding: 16px 8px;
}
.empty-external-files :deep(.el-empty__description) {
  font-size: 12px;
}
</style>

<style>
.context-menu-overlay {
  position: fixed;
  z-index: 10000;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  padding: 4px;
  min-width: 160px;
}
.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  transition: background 0.1s;
}
.context-menu-item:hover { background: var(--hover-bg); }
.context-menu-item.danger { color: #f56c6c; }
.context-menu-item.danger:hover { background: rgba(245, 108, 108, 0.1); }
.context-menu-divider { height: 1px; background: var(--border-color); margin: 4px 8px; }
</style>
